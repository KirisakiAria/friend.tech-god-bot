import mongoose from 'mongoose'
const Schema = mongoose.Schema

const schema = new Schema({
    addresses: [String],
})

const WhitelistModel = mongoose.model('Whitelist', schema)

export default WhitelistModel
