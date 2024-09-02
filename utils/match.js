import { ethers } from 'ethers'

const matchPrivateKey = privateKey => {
    try {
        if (!privateKey) {
            return false
        }
        new ethers.Wallet(privateKey)
        return true
    } catch (e) {
        return false
    }
}

const matchAddress = address => {
    if (!address) {
        return false
    }
    const parten = /^0x[0-9a-fA-F]{40}$/
    return parten.test(address)
}

export { matchPrivateKey, matchAddress }
