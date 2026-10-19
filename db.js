const { MongoClient } = require("mongodb");
require("dotenv").config();

if (!process.env.MONGODB_URI) {
    throw new Error("Не задана переменная MONGODB_URI. Проверьте файл .env");
}

const client = new MongoClient(process.env.MONGODB_URI);
let database = null;

async function connect() {
    await client.connect();
    database = client.db("cinema");
    console.log("База данных подключена");
}

function getCollection(name) {
    if (!database) {
        throw new Error("База не подключена. Сначала вызовите connect().");
    }
    return database.collection(name);
}

async function disconnect() {
    await client.close();
    database = null;
}

module.exports = { connect, disconnect, getCollection };
