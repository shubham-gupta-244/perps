export type LongShort = {
id : string
userId : string
orderId :string
price : number
qunatity:number
remainingQuantity:number
timeStamp: number
side : "Long" | "Short"
type : "Limit" | "Market"
lockedCollateral:number
lavarage:number
}

export type Position = {
id:string
quantity:number
price : number
levrage:number
liquidationPrice:number
markePrice:number
side:"LONG" | "SHORT"
size: number
margin:number
timeStap : Date

}

export type User = {
    userId:string
    balance:number
    lockedBalance:number
    freeBalance:number
    position: Position[]  
}

