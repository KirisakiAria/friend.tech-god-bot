import randomstring from 'randomstring'

const oneDimensionaltoTwoDimensional = (num, arr) => {
    const newArr = []
    while (arr.length > 0) {
        newArr.push(arr.splice(0, num))
    }
    return newArr
}

const getDate = () => {
    const date = new Date()
    const year = date.getFullYear()
    const month = padDate(date.getMonth() + 1)
    const day = padDate(date.getDate())
    const hours = padDate(date.getHours())
    const minutes = padDate(date.getMinutes())
    const dayOfWeek = formatDay(date.getDay())
    return `${year}-${month}-${day} ${hours}:${minutes} ${dayOfWeek}`
}

const formatDay = day => {
    switch (day) {
        case 0:
            return 'Sunday'
        case 1:
            return 'Monday'
        case 2:
            return 'Tuesday'
        case 3:
            return 'Wednesday'
        case 4:
            return 'Thursday'
        case 5:
            return 'Friday'
        case 6:
            return 'Saturday'
    }
}

const padDate = value => {
    return value < 10 ? '0' + value : value
}

const generateCode = () => {
    return randomstring.generate(30)
}

export { oneDimensionaltoTwoDimensional, getDate, generateCode }
