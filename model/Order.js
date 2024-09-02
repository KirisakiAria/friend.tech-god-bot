import mongoose from 'mongoose'
const Schema = mongoose.Schema

const schema = new Schema({
    type: String,
    chatId: Number,
    orderNo: String,
    address: String,
    key: String,
    monitoredWalletAddress: String,
    number: Number,
    date: String,
    price: String,
})

const OrderModel = mongoose.model('Order', schema)

export default OrderModel
