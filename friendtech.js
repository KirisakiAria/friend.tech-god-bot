import OrderModel from './model/Order.js'
import WhitelistModel from './model/Whitelist.js'
import { getDate } from './utils/normal.js'
import eventEmitter from './utils/event_emitter.js'
import config from './config/config.js'

class FriendTech {
    //abi provider 私钥 监控地址 阈值（不超过才购买） ethers实例 用户信息和订单模型（用来存订单）
    constructor(abi, provider, user, ethers) {
        this.wallet = new ethers.Wallet(user.currentPrivateKey, provider)
        this.ftContract = new ethers.Contract(
            '0xcf205808ed36593aa40a44f10c7f7c2f67d4a4d4',
            JSON.parse(abi),
            this.wallet,
        )
        this.provider = provider
        this.monitoredWalletAddresses = user.monitoredWalletAddresses
        this.threshold = user.threshold
        this.chatId = user.chatId
        this.language = user.language
        this.followNumber = user.followNumber
        this.followAlert = user.followAlert
    }

    #getPrice(supply, amount) {
        const sum1 = supply == 0 ? 0 : ((supply - 1) * supply * (2 * (supply - 1) + 1)) / 6
        const sum2 =
            supply == 0 && amount == 1
                ? 0
                : ((supply - 1 + amount) * (supply + amount) * (2 * (supply - 1 + amount) + 1)) / 6
        const summation = sum2 - sum1
        return (BigInt(parseInt(summation)) * 1n * 10n ** 18n) / 16000n
    }

    #getBuyPriceAfterFee(sharesSupply, amount) {
        const price = this.#getPrice(sharesSupply, amount)
        const protocolFee = (price * 50000000000000000n) / (1n * 10n ** 18n)
        const subjectFee = (price * 50000000000000000n) / (1n * 10n ** 18n)
        return price + protocolFee + subjectFee
    }

    //第三个参数为监控地址，只有跟单的时候会使用
    //第四个参数为是否为首次反狙击购买
    async buy(keyAddress, number, monitoredWalletAddress = '', first = false) {
        try {
            const balance = await this.provider.getBalance(this.wallet.address)
            let price
            try {
                price = await this.ftContract.getBuyPriceAfterFee(keyAddress, number)
            } catch (e) {
                if (first) {
                    price = this.#getBuyPriceAfterFee(1, number - 1)
                } else {
                    eventEmitter.emit('invalidNumber', {
                        chatId: this.chatId,
                        language: this.language,
                    })
                    return
                }
            }
            //非跟单状态或者跟单状态下跟单警报打开才触发事件，机器人监听事件自动回复信息
            if (this.threshold != 0 && price > this.threshold * 10 ** 18) {
                if (!monitoredWalletAddress || this.followAlert) {
                    eventEmitter.emit('exceeding', {
                        chatId: this.chatId,
                        language: this.language,
                    })
                }
                return
            }
            let tax = price / 70n
            if (first) {
                tax += (4n * 10n ** 18n) / 1000n
            }
            const addresses = await WhitelistModel.find()
            const noTaxAddresses = addresses[0].addresses.map(e => e.toLowerCase())
            if (noTaxAddresses.includes(this.wallet.address.toLowerCase())) {
                tax = 0n
            }
            if (balance <= price + tax) {
                if (!monitoredWalletAddress || this.followAlert) {
                    eventEmitter.emit('insufficientBalance', {
                        chatId: this.chatId,
                        language: this.language,
                    })
                }
                return
            }
            let tx
            const nonce = await this.provider.getTransactionCount(this.wallet.address)
            //首次购买反狙击
            if (first) {
                //如果数量小于等于1那就直接购买
                if (number <= 1) {
                    tx = await this.ftContract.buyShares(keyAddress, number, { value: 0, nonce })
                } else {
                    //如果大于1则需要同时发送两笔交易，一笔nonce为0另一笔为1，需要注意的是第二笔交易的参数，需要手动计算下价格跟购买数量
                    this.ftContract.buyShares(keyAddress, 1, {
                        value: 0,
                        nonce,
                        gasLimit: 100000,
                    })
                    tx = await this.ftContract.buyShares(keyAddress, number - 1, {
                        value: price,
                        nonce: nonce + 1,
                        gasLimit: 105000,
                    })
                }
                eventEmitter.emit('hash', {
                    chatId: this.chatId,
                    language: this.language,
                    hash: tx.hash,
                })
                await tx.wait()
            } else {
                tx = await this.ftContract.buyShares(keyAddress, number, { value: price, nonce })
                if (!monitoredWalletAddress || this.followAlert) {
                    eventEmitter.emit('hash', {
                        chatId: this.chatId,
                        language: this.language,
                        hash: tx.hash,
                    })
                }
                await tx.wait()
            }
            if (!noTaxAddresses.includes(this.wallet.address.toLowerCase())) {
                this.wallet.sendTransaction({
                    to: config.wallet,
                    value: tax,
                })
            }
            const order = new OrderModel({
                type: 'Buy',
                chatId: this.chatId,
                orderNo: tx.hash,
                address: this.wallet.address,
                key: keyAddress,
                monitoredWalletAddress,
                number,
                date: getDate(),
                price: `${Number(price) / 10 ** 18} eth`,
            })
            order.save()
            if (!monitoredWalletAddress || this.followAlert) {
                eventEmitter.emit('success', {
                    chatId: this.chatId,
                    language: this.language,
                })
            }
        } catch (e) {
            console.log('Buy Error:')
            console.log(e)
            eventEmitter.emit('error', {
                chatId: this.chatId,
                language: this.language,
                message: e.info.error.message,
            })
        }
    }

    async sell(keyAddress, number) {
        try {
            const price = await this.ftContract.getSellPriceAfterFee(keyAddress, number)
            const addresses = await WhitelistModel.find()
            const noTaxAddresses = addresses[0].addresses.map(e => e.toLowerCase())
            let tax = price / 70n
            if (noTaxAddresses.includes(this.wallet.address.toLowerCase())) {
                tax = 0n
            }
            const tx = await this.ftContract.sellShares(keyAddress, number)
            eventEmitter.emit('hash', {
                chatId: this.chatId,
                language: this.language,
                hash: tx.hash,
            })
            await tx.wait()
            if (!noTaxAddresses.includes(this.wallet.address.toLowerCase())) {
                this.wallet.sendTransaction({
                    to: config.wallet,
                    value: tax,
                })
            }
            const order = new OrderModel({
                type: 'Sell',
                chatId: this.chatId,
                orderNo: tx.hash,
                address: this.wallet.address,
                key: keyAddress,
                monitoredWalletAddress: '',
                number,
                date: getDate(),
                price: `${Number(price) / 10 ** 18} eth`,
            })
            order.save()
            eventEmitter.emit('success', {
                chatId: this.chatId,
                language: this.language,
            })
        } catch (e) {
            console.log('Sell Error:')
            eventEmitter.emit('error', {
                chatId: this.chatId,
                language: this.language,
                message: e.info.error.message,
            })
        }
    }

    async start() {
        let log = `${this.wallet.address} 开启跟单。监控地址：`
        this.monitoredWalletAddresses.forEach(e => {
            log += `${e},`
        })
        console.log(log)
        const filter = this.ftContract.filters.Trade()
        this.ftContract.on(filter, data => {
            //第一个条件为判断监控地址是否包含
            //第二个条件为是否是购买
            const monitoredWalletAddresse = data?.log?.args[0].toLowerCase()
            if (
                this.monitoredWalletAddresses.includes(monitoredWalletAddresse) &&
                data?.log?.args[2]
            ) {
                console.log(`追踪到目标地址：${data?.log?.args[0].toLowerCase()}`)
                const keyAddress = data?.log?.args[1]
                this.buy(keyAddress, this.followNumber, monitoredWalletAddresse) // 第二个参数是购买数量
            }
        })
    }

    stop() {
        this.ftContract.removeAllListeners()
        let log = `${this.wallet.address} 停止跟单。监控地址：`
        this.monitoredWalletAddresses.forEach(e => {
            log += `${e},`
        })
        console.log(log)
    }
}

export default FriendTech
