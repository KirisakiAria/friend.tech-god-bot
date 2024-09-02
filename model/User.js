import mongoose from 'mongoose'
const Schema = mongoose.Schema

const schema = new Schema({
    chatId: Number,
    privateKeys: [String],
    monitoredWalletAddresses: [String],
    currentPrivateKey: String,
    buyNumber: Number,
    followNumber: Number,
    sellNumber: Number,
    threshold: Number,
    language: String,
    follow: Boolean,
    followAlert: Boolean,
    selfReferralCode: String,
    referralCode: String,
    totalReferrals: Number,
})

const UserModel = mongoose.model('User', schema)

export default UserModel
