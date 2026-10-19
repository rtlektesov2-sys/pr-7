const fs = require("fs");
const path = require("path");
const db = require("./db");

async function migrate() {
    let connected = false;
    try {
        await db.connect();
        connected = true;

        const filePath = path.join(__dirname, "data.json");
        const courses = JSON.parse(fs.readFileSync(filePath, "utf8"));
        if (!Array.isArray(courses)) {
            throw new Error("data.json должен содержать массив курсов");
        }

        const collection = db.getCollection("courses");
        for (const course of courses) {
            await collection.updateOne(
                { id: course.id },
                { $setOnInsert: course },
                { upsert: true }
            );
        }

        const migratedCount = await collection.countDocuments({
            id: { $in: courses.map(course => course.id) }
        });
        if (migratedCount !== courses.length) {
            throw new Error(`В Atlas найдено ${migratedCount} из ${courses.length} исходных курсов`);
        }

        console.log(`Перенесено и проверено курсов: ${migratedCount}`);
        console.log("После проверки данных в Atlas файл data.json можно удалить.");
    } catch (error) {
        console.error("Не удалось перенести курсы:", error.message);
        process.exitCode = 1;
    } finally {
        if (connected) {
            await db.disconnect();
        }
    }
}

migrate();
