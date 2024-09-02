import TelegramBot from 'node-telegram-bot-api'
import config from './config/config.js'
import fs from 'fs'
import eventEmitter from './utils/event_emitter.js'
import { ethers } from 'ethers'
import mongoose from 'mongoose'
import UserModel from './model/User.js'
import OrderModel from './model/Order.js'
import FriendTech from './friendtech.js'
import { matchPrivateKey, matchAddress } from './utils/match.js'
import axios from 'axios'
import path from 'path'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { getDate, generateCode } from './utils/normal.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const abi = fs.readFileSync(path.resolve(__dirname, './abi/abi.json'))

const httpProvider = new ethers.JsonRpcProvider(
    `https://base-mainnet.g.alchemy.com/v2/${config.alchemyAPI}`,
)

const provider = new ethers.WebSocketProvider(
    `wss://base-mainnet.g.alchemy.com/v2/${config.alchemyAPI}`,
)

const followTasks = []

mongoose
    .connect(config.db, {
        user: config.user,
        pass: config.passwrod,
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(
        async () => {
            console.log('数据库连接成功。')
            console.log(`当前时间：${getDate()}`)
        },
        err => {
            console.log(`数据库连接失败：${err}`)
            console.log(`当前时间：${getDate()}`)
        },
    )

const languagePage = JSON.parse(fs.readFileSync(path.resolve(__dirname, './pages/language.json')))
const en = JSON.parse(fs.readFileSync(path.resolve(__dirname, './pages/en.json')))
const zh_cn = JSON.parse(fs.readFileSync(path.resolve(__dirname, './pages/zh_cn.json')))
const jp = JSON.parse(fs.readFileSync(path.resolve(__dirname, './pages/jp.json')))
const pages = {
    en,
    zh_cn,
    jp,
}

const enPrompt = JSON.parse(fs.readFileSync(path.resolve(__dirname, './prompts/en.json')))
const zh_cnPrompt = JSON.parse(fs.readFileSync(path.resolve(__dirname, './prompts/zh_cn.json')))
const jpPrompt = JSON.parse(fs.readFileSync(path.resolve(__dirname, './prompts/jp.json')))
const prompts = {
    en: enPrompt,
    zh_cn: zh_cnPrompt,
    jp: jpPrompt,
}

const enHelp = JSON.parse(fs.readFileSync(path.resolve(__dirname, './help/en.json')))
const zh_cnHelp = JSON.parse(fs.readFileSync(path.resolve(__dirname, './help/zh_cn.json')))
const jpHelp = JSON.parse(fs.readFileSync(path.resolve(__dirname, './help/jp.json')))
const help = {
    en: enHelp,
    zh_cn: zh_cnHelp,
    jp: jpHelp,
}

const generateUserWalletsKeyboard = (user, prefix) => {
    const walletsKeyboard = []
    user.privateKeys.forEach((e, i) => {
        const wallet = new ethers.Wallet(e, provider)
        walletsKeyboard.push([
            {
                text: wallet.address,
                callback_data: `${prefix}Wallet-${i}-${wallet.address}`,
            },
        ])
    })
    return walletsKeyboard
}

const generateMonitoredWalletsKeyboard = user => {
    const walletsKeyboard = []
    user.monitoredWalletAddresses.forEach((e, i) => {
        walletsKeyboard.push([
            {
                text: e,
                callback_data: `deleteMonitoredWallet-${i}`,
            },
        ])
    })
    return walletsKeyboard
}

const getOrders = async (page, user) => {
    const prompt = prompts[user.language]
    let text = ''
    const orders = await OrderModel.find({ chatId: user.chatId })
        .sort({ _id: -1 })
        .skip(page * 10)
        .limit(10)
    orders.forEach(e => {
        text += `<strong><a href="https://basescan.org/tx/${e.orderNo}">${e.orderNo}</a></strong>\nOrder Type: <strong>${e.type}</strong>\nCurrent Wallet Address: <strong>${e.address}</strong>\nMonitored Wallet Address: <strong>${e.monitoredWalletAddress}</strong>\nNumber: <strong>${e.number}</strong>\nDate: <strong>${e.date}</strong>\nPrice: <strong>${e.price}</strong>\n\n`
    })
    if (!text) {
        text = prompt.noMoreData
    }
    return text
}

const getMainPageData = (address = '', balance = 0, user, prompt) => {
    return `${prompt.tips}Address: <strong><a href="https://basescan.org/address/${address}">${address}</a></strong>\nBalance: <strong>${balance} eth</strong>\nReferral Link: <strong><a href="https://t.me/friend_tech_god_bot?start=${user.selfReferralCode}">https://t.me/friend_tech_god_bot?start=${user.selfReferralCode}</a></strong>\nTotal Referrals: <strong>${user.totalReferrals}</strong>\n\n${prompt.baseInfo}\nThreshold: <strong>${user.threshold} eth</strong>\nFollow Number: <strong>${user.followNumber}</strong>\nBuy Number: <strong>${user.buyNumber}</strong>\nSell Number: <strong>${user.buyNumber}</strong>`
}

const getTwitterUsername = async address => {
    const res = await axios.get(`https://prod-api.kosetto.com/users/${address}`)
    return `@${res.data.twitterUsername}`
}

const getAddressByGenericUserName = async (username, prompt) => {
    const res = await axios.get(
        `https://prod-api.kosetto.com/search/users?username=${username.replace('@', '')}`,
        {
            headers: {
                Authorization: config.authorization,
            },
        },
    )
    let text = prompt.checkUsernameAndTwitter2
    res.data.users.forEach(e => {
        text += `<strong><a href="https://basescan.org/address/${e.address}">${e.address}</a></strong>\n`
    })
    text += prompt.checkUsernameAndTwitter3
    return text
}

const getAddressByUserName = async username => {
    const res = await axios.get(
        `https://prod-api.kosetto.com/search/users?username=${username.replace('@', '')}`,
        {
            headers: {
                Authorization: config.authorization,
            },
        },
    )
    return res.data.users[0].address
}

const bot = new TelegramBot(config.tgbotToken, { polling: true })
console.log('机器人成功启动。')

bot.onText(/\/start (.+)|\/start/i, async (msg, match) => {
    try {
        const referralCode = match[1] ? match[1] : ''
        let wallet = null,
            balance = 0
        let user = await UserModel.findOne({ chatId: msg.chat.id })
        if (!user) {
            user = new UserModel({
                chatId: msg.chat.id,
                privateKeys: [],
                monitoredWalletAddresses: [],
                currentPrivateKey: '',
                buyNumber: 1,
                followNumber: 1,
                sellNumber: 1,
                threshold: 0,
                language: 'en',
                follow: false,
                selfReferralCode: generateCode(),
                referralCode,
                totalReferrals: 0,
            })
            await user.save()
            await UserModel.updateOne(
                { selfReferralCode: referralCode },
                { $inc: { totalReferrals: 1 } },
            )
        } else if (user.currentPrivateKey) {
            wallet = new ethers.Wallet(user.currentPrivateKey, provider)
            balance = await httpProvider.getBalance(wallet.address)
        }
        const opts = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: pages[user.language].main,
            },
        }
        const prompt = prompts[user.language]
        bot.sendMessage(
            msg.from.id,
            getMainPageData(wallet?.address, (Number(balance) / 10 ** 18).toFixed(5), user, prompt),
            opts,
        )
    } catch (e) {
        console.log(e)
    }
})

bot.onText(/\/help/, async msg => {
    try {
        const user = await UserModel.findOne({ chatId: msg.chat.id })
        const helpText = help[user.language].data
        const opts = {
            parse_mode: 'HTML',
        }
        bot.sendMessage(msg.from.id, helpText, opts)
    } catch (e) {
        console.log(e)
    }
})

bot.onText(/\/check/, async msg => {
    try {
        const user = await UserModel.findOne({ chatId: msg.chat.id })
        const prompt = prompts[user.language]
        const text = prompt.checkUsernameAndTwitter
        const opts = {
            reply_markup: {
                force_reply: true,
            },
        }
        const { message_id } = await bot.sendMessage(msg.from.id, text, opts)
        const id = bot.onReplyToMessage(msg.chat.id, message_id, async reply => {
            const chatId = reply.chat.id
            const text = reply.text.trim()
            let responseText
            if (matchAddress(text)) {
                try {
                    responseText = await getTwitterUsername(text)
                } catch (e) {
                    responseText = prompt.fail
                }
            } else {
                try {
                    responseText = await getAddressByGenericUserName(text, prompt)
                } catch (e) {
                    responseText = prompt.fail
                    console.log(e)
                }
            }
            await bot.sendMessage(chatId, responseText, { parse_mode: 'HTML' })
            // 移除监听器，释放内存
            bot.removeReplyListener(id)
        })
    } catch (e) {
        console.log(e)
    }
})

bot.onText(/\/balance/, async msg => {
    try {
        const user = await UserModel.findOne({ chatId: msg.chat.id })
        const opts = {
            parse_mode: 'HTML',
        }
        const wallet = new ethers.Wallet(user.currentPrivateKey, provider)
        const balance = await httpProvider.getBalance(wallet.address)
        const text = `Address: <strong><a href="https://basescan.org/address/${wallet.address}">${
            wallet.address
        }</a></strong>\nBalance: <strong>${(Number(balance) / 10 ** 18).toFixed(5)} eth</strong>`
        bot.sendMessage(msg.from.id, text, opts)
    } catch (e) {
        console.log(e)
    }
})

bot.onText(/\/threshold/, async msg => {
    try {
        const user = await UserModel.findOne({ chatId: msg.chat.id })
        const prompt = prompts[user.language]
        const text = prompt.setThreshold
        const opts = {
            reply_markup: {
                force_reply: true,
            },
        }
        const { message_id } = await bot.sendMessage(msg.from.id, text, opts)
        const id = bot.onReplyToMessage(msg.chat.id, message_id, async reply => {
            const chatId = reply.chat.id
            const text = reply.text.trim()
            let responseText = prompt.saved
            const user = await UserModel.findOne({ chatId: msg.chat.id })
            const number = Number.parseFloat(text)
            if (isNaN(number)) {
                responseText = prompt.notANumber
            } else {
                await UserModel.updateOne({ chatId: msg.chat.id }, { threshold: number })
            }
            await user.save()
            await bot.sendMessage(chatId, responseText)
            // 移除监听器，释放内存
            bot.removeReplyListener(id)
        })
    } catch (e) {
        console.log(e)
    }
})

bot.onText(/\/sftn/, async msg => {
    try {
        const user = await UserModel.findOne({ chatId: msg.chat.id })
        const prompt = prompts[user.language]
        const text = prompt.tokenNumber
        const opts = {
            reply_markup: {
                force_reply: true,
            },
        }
        const { message_id } = await bot.sendMessage(msg.from.id, text, opts)
        const id = bot.onReplyToMessage(msg.chat.id, message_id, async reply => {
            const chatId = reply.chat.id
            const text = reply.text.trim()
            let responseText = prompt.saved
            const user = await UserModel.findOne({ chatId: msg.chat.id })
            const number = Number.parseInt(text)
            if (isNaN(number)) {
                responseText = prompt.notANumber
            } else if (number > 1000) {
                responseText = prompt.limit
            } else {
                await UserModel.updateOne({ chatId: msg.chat.id }, { followNumber: number })
            }
            await user.save()
            await bot.sendMessage(chatId, responseText)
            // 移除监听器，释放内存
            bot.removeReplyListener(id)
        })
    } catch (e) {
        console.log(e)
    }
})

bot.onText(/\/sbtn/, async msg => {
    try {
        const user = await UserModel.findOne({ chatId: msg.chat.id })
        const prompt = prompts[user.language]
        const text = prompt.tokenNumber
        const opts = {
            reply_markup: {
                force_reply: true,
            },
        }
        const { message_id } = await bot.sendMessage(msg.from.id, text, opts)
        const id = bot.onReplyToMessage(msg.chat.id, message_id, async reply => {
            const chatId = reply.chat.id
            const text = reply.text.trim()
            let responseText = prompt.saved
            const user = await UserModel.findOne({ chatId: msg.chat.id })
            const number = Number.parseInt(text)
            if (isNaN(number)) {
                responseText = prompt.notANumber
            } else if (number > 1000) {
                responseText = prompt.limit
            } else {
                await UserModel.updateOne({ chatId: msg.chat.id }, { buyNumber: number })
            }
            await user.save()
            await bot.sendMessage(chatId, responseText)
            // 移除监听器，释放内存
            bot.removeReplyListener(id)
        })
    } catch (e) {
        console.log(e)
    }
})

bot.onText(/\/sstn/, async msg => {
    try {
        const user = await UserModel.findOne({ chatId: msg.chat.id })
        const prompt = prompts[user.language]
        const text = prompt.tokenNumber
        const opts = {
            reply_markup: {
                force_reply: true,
            },
        }
        const { message_id } = await bot.sendMessage(msg.from.id, text, opts)
        const id = bot.onReplyToMessage(msg.chat.id, message_id, async reply => {
            const chatId = reply.chat.id
            const text = reply.text.trim()
            let responseText = prompt.saved
            const user = await UserModel.findOne({ chatId: msg.chat.id })
            const number = Number.parseInt(text)
            if (isNaN(number)) {
                responseText = prompt.notANumber
            } else if (number > 1000) {
                responseText = prompt.limit
            } else {
                await UserModel.updateOne({ chatId: msg.chat.id }, { sellNumber: number })
            }
            await user.save()
            await bot.sendMessage(chatId, responseText)
            // 移除监听器，释放内存
            bot.removeReplyListener(id)
        })
    } catch (e) {
        console.log(e)
    }
})

bot.onText(/\/buytoken/, async msg => {
    try {
        const user = await UserModel.findOne({ chatId: msg.chat.id })
        const prompt = prompts[user.language]
        let text, opts
        if (!user.currentPrivateKey) {
            text = prompt.noWallet
        } else {
            text = prompt.tokenAddress
            opts = {
                reply_markup: {
                    force_reply: true,
                },
            }
        }
        const { message_id } = await bot.sendMessage(msg.from.id, text, opts)
        const id = bot.onReplyToMessage(msg.chat.id, message_id, async reply => {
            const chatId = reply.chat.id
            const text = reply.text.trim()
            let responseText = prompt.saved
            const user = await UserModel.findOne({ chatId: msg.chat.id })
            if (matchAddress(text)) {
                const ft = new FriendTech(abi, provider, user, ethers)
                ft.buy(text, user.buyNumber)
                responseText = prompt.sentTransaction
            } else {
                responseText = prompt.invalidMonitoredWalletAddresses
            }
            await user.save()
            await bot.sendMessage(chatId, responseText)
            // 移除监听器，释放内存
            bot.removeReplyListener(id)
        })
    } catch (e) {
        console.log(e)
    }
})

bot.onText(/\/selltoken/, async msg => {
    try {
        const user = await UserModel.findOne({ chatId: msg.chat.id })
        const prompt = prompts[user.language]
        let text, opts
        if (!user.currentPrivateKey) {
            text = prompt.noWallet
        } else {
            text = prompt.tokenAddress
            opts = {
                reply_markup: {
                    force_reply: true,
                },
            }
        }
        const { message_id } = await bot.sendMessage(msg.from.id, text, opts)
        const id = bot.onReplyToMessage(msg.chat.id, message_id, async reply => {
            const chatId = reply.chat.id
            const text = reply.text.trim()
            let responseText = prompt.saved
            const user = await UserModel.findOne({ chatId: msg.chat.id })
            if (matchAddress(text)) {
                const ft = new FriendTech(abi, provider, user, ethers)
                ft.sell(text, user.sellNumber)
                responseText = prompt.sentTransaction
            } else {
                responseText = prompt.invalidMonitoredWalletAddresses
            }
            await user.save()
            await bot.sendMessage(chatId, responseText)
            // 移除监听器，释放内存
            bot.removeReplyListener(id)
        })
    } catch (e) {
        console.log(e)
    }
})

bot.onText(/\/setting/, async msg => {
    try {
        const user = await UserModel.findOne({ chatId: msg.chat.id })
        const prompt = prompts[user.language]
        const text = prompt.pleaseSelect
        const opts = {
            reply_markup: {
                inline_keyboard: pages[user.language].setting,
            },
        }
        bot.sendMessage(msg.from.id, text, opts)
    } catch (e) {
        console.log(e)
    }
})

//内联小键盘回调
bot.on('callback_query', async function onCallbackQuery(callbackQuery) {
    try {
        let action = callbackQuery.data
        const msg = callbackQuery.message
        let opts = { parse_mode: 'HTML' },
            text = '🤔'
        const user = await UserModel.findOne({ chatId: msg.chat.id })
        const prompt = prompts[user.language]
        let wallet, balance
        if (user.currentPrivateKey) {
            wallet = new ethers.Wallet(user.currentPrivateKey, provider)
            balance = await httpProvider.getBalance(wallet.address)
        }
        switch (action) {
            case 'generateWallet':
                if (user.privateKeys.length >= 10) {
                    text = prompt.maximumWalletAddress
                } else {
                    const newWallet = ethers.Wallet.createRandom({ provider })
                    await UserModel.updateOne(
                        { chatId: msg.chat.id },
                        { currentPrivateKey: newWallet.privateKey },
                    )
                    user.privateKeys.push(newWallet.privateKey)
                    await user.save()
                    text = `${prompt.generateWallet} ${newWallet.address}\n${prompt.exportWalletTip}`
                }
                break
            case 'importWallet':
                if (user.privateKeys.length >= 10) {
                    text = prompt.maximumWalletAddress
                } else {
                    text = prompt.importWallet
                    opts = {
                        reply_markup: {
                            force_reply: true,
                        },
                    }
                }
                break
            case 'checkUsernameAndTwitter':
                text = prompt.checkUsernameAndTwitter
                opts = {
                    reply_markup: {
                        force_reply: true,
                    },
                }
                break
            case 'importMonitoredWallet':
                text = prompt.importMonitoredWallet
                opts = {
                    parse_mode: 'HTML',
                    reply_markup: {
                        force_reply: true,
                    },
                }
                break
            case 'getMyBalance':
                if (!user.currentPrivateKey) {
                    text = prompt.noWallet
                    break
                } else {
                    text = `Address: <strong><a href="https://basescan.org/address/${
                        wallet.address
                    }">${wallet.address}</a></strong>\nBalance: <strong>${(
                        Number(balance) /
                        10 ** 18
                    ).toFixed(5)} eth</strong>`
                }
                break
            case 'allWalletsBalance':
                if (!user.currentPrivateKey) {
                    text = prompt.noWallet
                    break
                } else {
                    await bot.sendMessage(msg.chat.id, prompt.querying, opts)
                    text = ''
                    for (const privateKey of user.privateKeys) {
                        const wallet = new ethers.Wallet(privateKey, provider)
                        const balance = await httpProvider.getBalance(wallet.address)
                        text += `Address: <strong><a href="https://basescan.org/address/${
                            wallet.address
                        }">${wallet.address}</a></strong>\nBalance: <strong>${(
                            Number(balance) /
                            10 ** 18
                        ).toFixed(5)} eth</strong>\n\n`
                    }
                }
                break
            case 'transferOutETH':
                if (!user.currentPrivateKey) {
                    text = prompt.noWallet
                    break
                } else {
                    text = prompt.transferOutETH
                    opts = {
                        parse_mode: 'HTML',
                        reply_markup: {
                            force_reply: true,
                        },
                    }
                }
                break
            case 'setThreshold':
                text = prompt.setThreshold
                opts = {
                    reply_markup: {
                        force_reply: true,
                    },
                }
                break
            case 'setFollowTokenNumber':
                text = prompt.tokenNumber
                opts = {
                    reply_markup: {
                        force_reply: true,
                    },
                }
                break
            case 'setBuyTokenNumber':
                text = prompt.tokenNumber
                opts = {
                    reply_markup: {
                        force_reply: true,
                    },
                }
                break
            case 'setSellTokenNumber':
                text = prompt.tokenNumber
                opts = {
                    reply_markup: {
                        force_reply: true,
                    },
                }
                break
            case 'start':
                if (!user.currentPrivateKey) {
                    text = prompt.noWallet
                    break
                }
                if (!user.monitoredWalletAddresses.length) {
                    text = prompt.noMonitoredWallet
                    break
                }
                let ft
                const index = followTasks.findIndex(e => e.chatId == msg.chat.id)
                if (index == -1) {
                    ft = new FriendTech(abi, provider, user, ethers)
                }
                ft.start()
                followTasks.push(ft)
                await UserModel.updateOne({ chatId: msg.chat.id }, { follow: true })
                await user.save()
                text = prompt.followstarted
                break
            case 'stop':
                const index2 = followTasks.findIndex(e => e.chatId == msg.chat.id)
                if (index2 != -1) {
                    followTasks[index2].stop()
                    await UserModel.updateOne({ chatId: msg.chat.id }, { follow: false })
                    await user.save()
                    followTasks.splice(index2, 1)
                    text = prompt.followStoped
                } else {
                    text = prompt.noTask
                }
                break
            case 'buyToken':
                if (!user.currentPrivateKey) {
                    text = prompt.noWallet
                } else {
                    text = prompt.tokenAddress
                    opts = {
                        reply_markup: {
                            force_reply: true,
                        },
                    }
                }
                break
            case 'sellToken':
                if (!user.currentPrivateKey) {
                    text = prompt.noWallet
                } else {
                    text = prompt.tokenAddress
                    opts = {
                        reply_markup: {
                            force_reply: true,
                        },
                    }
                }
                break
            case 'antiSniper':
                if (!user.currentPrivateKey) {
                    text = prompt.noWallet
                } else {
                    text = prompt.tokenNumber
                    opts = {
                        reply_markup: {
                            force_reply: true,
                        },
                    }
                }
                break
            case 'checkOrders':
                text = await getOrders(0, user)
                opts = {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: 'next',
                                    callback_data: `checkOrders-${1}`,
                                },
                            ],
                        ],
                    },
                }
                break
            case 'selectWallet':
                text = prompt.selectWallet
                const walletsKeyboard1 = generateUserWalletsKeyboard(user, 'select')
                if (walletsKeyboard1.length) {
                    opts = {
                        reply_markup: {
                            inline_keyboard: walletsKeyboard1,
                        },
                    }
                } else {
                    text = prompt.noWallet
                }
                break
            case 'deleteWallet':
                text = prompt.deleteWallet
                const walletsKeyboard2 = generateUserWalletsKeyboard(user, 'delete')
                if (walletsKeyboard2.length) {
                    opts = {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: walletsKeyboard2,
                        },
                    }
                } else {
                    text = prompt.noWallet
                }
                break
            case 'exportWallet':
                text = prompt.exportWallet
                const walletsKeyboard3 = generateUserWalletsKeyboard(user, 'export')
                if (walletsKeyboard3.length) {
                    opts = {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: walletsKeyboard3,
                        },
                    }
                } else {
                    text = prompt.noWallet
                }
                break
            case 'monitoredWalletList':
                if (user.monitoredWalletAddresses.length) {
                    await bot.sendMessage(msg.chat.id, prompt.querying)
                    text = prompt.monitoredWalletList
                    for (const address of user.monitoredWalletAddresses) {
                        let twitter
                        try {
                            twitter = await getTwitterUsername(address)
                        } catch (e) {
                            twitter = 'No data'
                        }
                        text += `<a href="https://basescan.org/address/${address}">${address}</a>: <strong>${twitter}</strong>\n`
                    }
                } else {
                    text = prompt.noMonitoredWallet
                }
                break
            case 'deleteMonitoredWallet':
                text = prompt.deleteMonitoredWallet
                const walletsKeyboard4 = generateMonitoredWalletsKeyboard(user)
                if (walletsKeyboard4.length) {
                    opts = {
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: walletsKeyboard4,
                        },
                    }
                } else {
                    text = prompt.noMonitoredWallet
                }
                break
            case 'setting':
                text = prompt.pleaseSelect
                opts = {
                    reply_markup: {
                        inline_keyboard: pages[user.language].setting,
                    },
                }
                break
            case 'toggleFollowAlertStatus':
                text = prompt.toggleFollowAlertStatus
                opts = {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: pages[user.language].toggleFollowAlertStatus,
                    },
                }
                break
            case 'followAlertStatusOn':
                text = prompt.saved
                await UserModel.updateOne({ chatId: msg.chat.id }, { followAlert: true })
                await user.save()
                break
            case 'followAlertStatusOff':
                text = prompt.saved
                await UserModel.updateOne({ chatId: msg.chat.id }, { followAlert: false })
                await user.save()
                break
            case 'setReferralCode':
                if (user.referralCode) {
                    text = prompt.bound
                } else {
                    text = prompt.setReferralCode
                    opts = {
                        reply_markup: {
                            force_reply: true,
                        },
                    }
                }
                break
            case 'checkMyReferralLink':
                text = `Referral Code: <strong>${user.selfReferralCode}</strong>\nReferral Link: <strong><a href="https://t.me/friend_tech_god_bot?start=${user.selfReferralCode}">https://t.me/friend_tech_god_bot?start=${user.selfReferralCode}</a></strong>\nTotal Referrals: <strong>${user.totalReferrals}</strong>`
                break
            case 'changeLanguage':
                text = prompt.changeLanguage
                opts = {
                    reply_markup: {
                        inline_keyboard: languagePage,
                    },
                }
                break
            case 'setEnglish':
                text = 'Success.'
                await UserModel.updateOne({ chatId: msg.chat.id }, { language: 'en' })
                await user.save()
                opts = {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: pages['en'].main,
                    },
                }
                text = getMainPageData(
                    wallet?.address,
                    (Number(balance) / 10 ** 18).toFixed(5),
                    user,
                    prompts['en'],
                )
                break
            case 'setSimplifiedChinese':
                text = '切换成功。'
                await UserModel.updateOne({ chatId: msg.chat.id }, { language: 'zh_cn' })
                await user.save()
                opts = {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: pages['zh_cn'].main,
                    },
                }
                text = getMainPageData(
                    wallet?.address,
                    (Number(balance) / 10 ** 18).toFixed(5),
                    user,
                    prompts['zh_cn'],
                )
                break
            case 'setJapanese':
                await UserModel.updateOne({ chatId: msg.chat.id }, { language: 'jp' })
                await user.save()
                opts = {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: pages['jp'].main,
                    },
                }
                text = getMainPageData(
                    wallet?.address,
                    (Number(balance) / 10 ** 18).toFixed(5),
                    user,
                    prompts['jp'],
                )
                break
            default:
                break
        }

        //订单翻页
        if (action.includes('checkOrders-')) {
            const page = Number.parseInt(action.split('-')[1])
            text = await getOrders(page, user)
            let inline_keyboard
            if (!page) {
                inline_keyboard = [
                    [
                        {
                            text: 'next',
                            callback_data: `checkOrders-${page + 1}`,
                        },
                    ],
                ]
            } else {
                inline_keyboard = [
                    [
                        {
                            text: 'prev',
                            callback_data: `checkOrders-${page - 1}`,
                        },
                        {
                            text: 'next',
                            callback_data: `checkOrders-${page + 1}`,
                        },
                    ],
                ]
            }
            if (text == prompt.noMoreData) {
                inline_keyboard = [
                    [
                        {
                            text: 'prev',
                            callback_data: `checkOrders-${page - 1}`,
                        },
                    ],
                ]
            }
            opts = {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard,
                },
            }
        }

        //选择、删除、导出钱包的操作
        if (action.includes('selectWallet-')) {
            const index = action.split('-')[1]
            const address = action.split('-')[2]
            await UserModel.updateOne(
                { chatId: msg.chat.id },
                { currentPrivateKey: user.privateKeys[index] },
            )
            await user.save()
            const balance = await httpProvider.getBalance(address)
            text = `${prompt.selectWalletSuccess} ${address} ${prompt.balance}${(
                Number(balance) /
                10 ** 18
            ).toFixed(5)} eth`
            await bot.sendMessage(msg.chat.id, text, {
                parse_mode: 'HTML',
            })
            const newUser = await UserModel.findOne({ chatId: msg.chat.id })
            opts = {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: pages[newUser.language].main,
                },
            }
            text = getMainPageData(
                address,
                (Number(balance) / 10 ** 18).toFixed(5),
                newUser,
                prompts[newUser.language],
            )
        } else if (action.includes('deleteWallet-')) {
            const index = action.split('-')[1]
            const privateKey = user.privateKeys[index]
            user.privateKeys.splice(index, 1)
            if (user.privateKeys.length && privateKey == user.currentPrivateKey) {
                await UserModel.updateOne(
                    { chatId: msg.chat.id },
                    { currentPrivateKey: user.privateKeys[0] },
                )
            } else if (!user.privateKeys.length) {
                await UserModel.updateOne({ chatId: msg.chat.id }, { currentPrivateKey: '' })
            }
            await user.save()
            await bot.sendMessage(msg.chat.id, prompt.deleteWalletSuccess, opts)
            text = prompt.deleteWallet
            const newUser = await UserModel.findOne({ chatId: msg.chat.id })
            const walletsKeyboard2 = generateUserWalletsKeyboard(newUser, 'delete')
            if (walletsKeyboard2.length) {
                opts = {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: walletsKeyboard2,
                    },
                }
            } else {
                text = prompt.noWallet
            }
        } else if (action.includes('exportWallet-')) {
            const index = action.split('-')[1]
            const address = action.split('-')[2]
            await UserModel.updateOne(
                { chatId: msg.chat.id },
                { currentPrivateKey: user.privateKeys[index] },
            )
            await user.save()
            opts = {
                parse_mode: 'HTML',
            }
            text = `Address: <strong>${address}</strong>\nPrivateKey: <strong>${user.privateKeys[index]}</strong>\n${prompt.export}`
        } else if (action.includes('deleteMonitoredWallet-')) {
            const index = action.split('-')[1]
            user.monitoredWalletAddresses.splice(index, 1)
            await user.save()
            text = prompt.deleteWalletSuccess
        }

        const { message_id } = await bot.sendMessage(msg.chat.id, text, opts)

        //3分钟自动删除消息
        if (action.includes('exportWallet-')) {
            setTimeout(() => {
                bot.deleteMessage(msg.chat.id, message_id)
            }, 180000)
        }

        //强制回复的回调
        const id = bot.onReplyToMessage(msg.chat.id, message_id, async reply => {
            const chatId = reply.chat.id
            const text = reply.text.trim()
            let responseText = prompt.saved
            let number
            let opts = {
                parse_mode: 'HTML',
            }
            const user = await UserModel.findOne({ chatId: msg.chat.id })
            switch (action) {
                case 'importWallet':
                    if (matchPrivateKey(text)) {
                        await UserModel.updateOne(
                            { chatId: msg.chat.id },
                            { currentPrivateKey: text },
                        )
                        user.privateKeys.push(text)
                        await user.save()
                        const newWallet = new ethers.Wallet(text, provider)
                        responseText = `${prompt.importWalletSuccess}${newWallet.address}`
                    } else {
                        responseText = prompt.invalidPrivateKey
                    }
                    break
                case 'checkUsernameAndTwitter':
                    if (matchAddress(text)) {
                        try {
                            responseText = await getTwitterUsername(text)
                        } catch (e) {
                            responseText = prompt.fail
                        }
                    } else {
                        try {
                            responseText = await getAddressByGenericUserName(text, prompt)
                        } catch (e) {
                            responseText = prompt.fail
                            console.log(e)
                        }
                    }
                    break
                case 'importMonitoredWallet':
                    if (matchAddress(text)) {
                        user.monitoredWalletAddresses.push(text.toLowerCase())
                        await user.save()
                    } else if (text.includes(',')) {
                        let wallets = text.split(',')
                        const result = wallets.every(matchAddress)
                        if (result) {
                            wallets = wallets.map(e => e.toLowerCase())
                            user.monitoredWalletAddresses =
                                user.monitoredWalletAddresses.concat(wallets)
                            await user.save()
                        } else {
                            responseText = prompt.fail
                        }
                    } else {
                        try {
                            const addr = await getAddressByUserName(text)
                            user.monitoredWalletAddresses.push(addr.toLowerCase())
                            await user.save()
                        } catch (e) {
                            responseText = prompt.fail
                            console.log(e)
                        }
                    }
                    break
                case 'transferOutETH':
                    const array = text.split(',')
                    const to = array[0]
                    const value = parseFloat(array[1])
                    if (matchAddress(to) && !isNaN(value)) {
                        const balance = await httpProvider.getBalance(wallet.address)
                        if (balance <= BigInt(value * 10 ** 18)) {
                            responseText = prompt.insufficientBalance
                        } else {
                            const tx = await wallet.sendTransaction({
                                to,
                                value: BigInt(parseInt(value * 10 ** 18)),
                            })
                            eventEmitter.emit('hash', {
                                chatId,
                                language: user.language,
                                hash: tx.hash,
                            })
                            responseText = prompt.sentTransaction
                        }
                    } else {
                        responseText = prompt.transferOutETHInvalidFormat
                    }
                    break
                case 'setThreshold':
                    number = Number.parseFloat(text)
                    if (isNaN(number)) {
                        responseText = prompt.notANumber
                    } else {
                        await UserModel.updateOne({ chatId: msg.chat.id }, { threshold: number })
                        await user.save()
                    }
                    break
                case 'buyToken':
                    if (matchAddress(text)) {
                        const ft = new FriendTech(abi, provider, user, ethers)
                        ft.buy(text, user.buyNumber)
                        responseText = prompt.sentTransaction
                    } else {
                        responseText = prompt.invalidMonitoredWalletAddresses
                    }
                    break
                case 'sellToken':
                    if (matchAddress(text)) {
                        const ft = new FriendTech(abi, provider, user, ethers)
                        ft.sell(text, user.sellNumber)
                        responseText = prompt.sentTransaction
                    } else {
                        responseText = prompt.invalidMonitoredWalletAddresses
                    }
                    break
                case 'antiSniper':
                    number = Number.parseInt(text)
                    if (isNaN(number)) {
                        responseText = prompt.notANumber
                    } else if (number > 1000) {
                        responseText = prompt.limit
                    } else {
                        const ft = new FriendTech(abi, provider, user, ethers)
                        ft.buy(wallet.address, number, '', true)
                        responseText = prompt.sentTransaction
                    }
                    break
                case 'setFollowTokenNumber':
                    number = Number.parseInt(text)
                    if (isNaN(number)) {
                        responseText = prompt.notANumber
                    } else if (number > 1000) {
                        responseText = prompt.limit
                    } else {
                        await UserModel.updateOne({ chatId: msg.chat.id }, { followNumber: number })
                        await user.save()
                    }
                    break
                case 'setBuyTokenNumber':
                    number = Number.parseInt(text)
                    if (isNaN(number)) {
                        responseText = prompt.notANumber
                    } else if (number > 1000) {
                        responseText = prompt.limit
                    } else {
                        await UserModel.updateOne({ chatId: msg.chat.id }, { buyNumber: number })
                        await user.save()
                    }
                    break
                case 'setSellTokenNumber':
                    number = Number.parseInt(text)
                    if (isNaN(number)) {
                        responseText = prompt.notANumber
                    } else if (number > 1000) {
                        responseText = prompt.limit
                    } else {
                        await UserModel.updateOne({ chatId: msg.chat.id }, { sellNumber: number })
                        await user.save()
                    }
                    break
                case 'setReferralCode':
                    const doc = await UserModel.findOneAndUpdate(
                        { selfReferralCode: text },
                        { $inc: { totalReferrals: 1 } },
                    )
                    if (doc) {
                        await UserModel.updateOne({ chatId: msg.chat.id }, { referralCode: text })
                    } else {
                        responseText = prompt.referralCodeNotFound
                    }
                    await user.save()
                    break
            }
            await bot.sendMessage(chatId, responseText, opts)
            // 移除监听器，释放内存
            bot.removeReplyListener(id)
        })
    } catch (e) {
        console.log(e)
    }
})

eventEmitter.addListener('exceeding', data => {
    bot.sendMessage(data.chatId, prompts[data.language].exceeding)
})

eventEmitter.addListener('insufficientBalance', data => {
    bot.sendMessage(data.chatId, prompts[data.language].insufficientBalance)
})

eventEmitter.addListener('hash', data => {
    bot.sendMessage(
        data.chatId,
        `${prompts[data.language].hash} <a href="https://basescan.org/tx/${data.hash}">${
            data.hash
        }</a>`,
        {
            parse_mode: 'HTML',
        },
    )
})

eventEmitter.addListener('success', data => {
    bot.sendMessage(data.chatId, prompts[data.language].success)
})

eventEmitter.addListener('error', data => {
    bot.sendMessage(
        data.chatId,
        `${prompts[data.language].error}\nError Message: <strong>${data.message}</strong>`,
        {
            parse_mode: 'HTML',
        },
    )
})

eventEmitter.addListener('invalidNumber', data => {
    bot.sendMessage(data.chatId, prompts[data.language].invalidNumber)
})

//保持链接
bot.onText(/\/heartbeat/, async msg => {
    try {
        await bot.sendMessage(msg.from.id, 'Heartbeat message confirmed.')
    } catch (e) {
        console.log(e)
    }
})
