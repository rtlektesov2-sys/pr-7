const express = require("express");
const fs = require("fs");
const path = require("path");
const db = require("./db");

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
const PORT = process.env.PORT || 3000;
const ENROLLMENTS_FILE = path.join(__dirname, "enrollments.json");
const FEEDBACK_FILE = path.join(__dirname, "feedback.json");


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(function (req, res, next) {
    console.log(`${req.method} ${req.url}`);
    next();
});

app.use(express.static(path.join(__dirname, "public"), { index: false }));

async function readCourses() {
    return db.getCollection("courses")
        .find({}, { projection: { _id: 0 } })
        .sort({ id: 1 })
        .toArray();
}

function validateCourse(course) {
    const problems = [];

    if (!course || typeof course !== "object" || Array.isArray(course)) {
        return ["Данные курса должны быть объектом"];
    }

    if (typeof course.title !== "string" || course.title.trim() === "") {
        problems.push("Требуется непустое поле title");
    }

    const optionalTextFields = ["description", "instructor", "category", "level"];
    for (const field of optionalTextFields) {
        if (course[field] !== undefined &&
            (typeof course[field] !== "string" || course[field].trim() === "")) {
            problems.push(`Поле ${field} должно быть непустой строкой`);
        }
    }

    if (course.durationHours !== undefined &&
        (!Number.isInteger(course.durationHours) || course.durationHours <= 0)) {
        problems.push("Поле durationHours должно быть целым числом больше нуля");
    }
    if (course.price !== undefined &&
        (typeof course.price !== "number" || !Number.isFinite(course.price) || course.price < 0)) {
        problems.push("Поле price должно быть числом не меньше нуля");
    }
    return problems;
}

function createCourse(course, id) {
    return {
        id: id,
        title: course.title.trim(),
        description: course.description?.trim() || "Описание курса скоро появится.",
        instructor: course.instructor?.trim() || "Приглашённый преподаватель",
        category: course.category?.trim() || "Программирование",
        level: course.level?.trim() || "Начальный",
        durationHours: course.durationHours ?? 1,
        price: course.price ?? 0,
        ...(typeof course.image === "string" && course.image.startsWith("/img/") ? { image: course.image } : {})
    };
}

const courseCollectionRoutes = ["/api/items", "/api/courses"];

app.get("/", async function (req, res) {
    try {
        const allCourses = await readCourses();
        const categories = [...new Set(allCourses.map(course => course.category))].sort();
        const categoryFilter = typeof req.query.category === "string" ? req.query.category : "";
        const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
        const courses = allCourses.filter(course => {
            const matchesCategory = !categoryFilter || course.category === categoryFilter;
            const searchable = `${course.title} ${course.description} ${course.instructor}`.toLowerCase();
            return matchesCategory && searchable.includes(query.toLowerCase());
        });

        res.render("index", {
            title: "Каталог онлайн-курсов",
            courses: courses,
            totalCourses: allCourses.length,
            categories: categories,
            categoryFilter: categoryFilter,
            query: query,
            year: new Date().getFullYear()
        });
    } catch (err) {
        res.status(500).render("404", {
            title: "Ошибка",
            heading: "Не удалось загрузить каталог.",
            message: "Попробуйте открыть страницу ещё раз.",
            year: new Date().getFullYear()
        });
    }
});

app.get("/about", function (req, res) {
    res.render("about", {
        title: "О платформе",
        year: new Date().getFullYear()
    });
});

app.get("/feedback", function (req, res) {
    res.render("feedback", {
        title: "Обратная связь",
        heading: "Расскажите, что думаете.",
        errors: [],
        formData: {},
        success: req.query.sent === "1",
        year: new Date().getFullYear()
    });
});

app.post("/feedback", function (req, res) {
    const formData = {
        name: typeof req.body.name === "string" ? req.body.name.trim() : "",
        email: typeof req.body.email === "string" ? req.body.email.trim() : "",
        subject: typeof req.body.subject === "string" ? req.body.subject.trim() : "",
        message: typeof req.body.message === "string" ? req.body.message.trim() : ""
    };
    const errors = [];

    if (formData.name.length <= 8) {
        errors.push("Имя должно содержать более 8 символов.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        errors.push("Введите корректный email.");
    }
    if (formData.subject.length < 3) {
        errors.push("Тема обращения должна содержать не менее 3 символов.");
    }
    if (formData.message.length < 10) {
        errors.push("Сообщение должно содержать не менее 10 символов.");
    }

    if (errors.length > 0) {
        return res.status(400).render("feedback", {
            title: "Обратная связь",
            heading: "Расскажите, что думаете.",
            errors: errors,
            formData: formData,
            success: false,
            year: new Date().getFullYear()
        });
    }

    try {
        const feedback = JSON.parse(fs.readFileSync(FEEDBACK_FILE, "utf8"));
        const maxId = feedback.reduce((max, item) => Math.max(max, item.id), 0);
        feedback.push({
            id: maxId + 1,
            ...formData,
            sentAt: new Date().toISOString()
        });
        fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2), "utf8");
        res.redirect(303, "/feedback?sent=1");
    } catch (err) {
        res.status(500).render("feedback", {
            title: "Обратная связь",
            heading: "Расскажите, что думаете.",
            errors: ["Не удалось отправить сообщение. Попробуйте позже."],
            formData: formData,
            success: false,
            year: new Date().getFullYear()
        });
    }
});

app.get("/film/:id", async function (req, res) {
    try {
        const id = Number(req.params.id);
        const course = await db.getCollection("courses").findOne({ id: id }, { projection: { _id: 0 } });
        if (!course) {
            return res.status(404).render("404", {
                title: "Курс не найден",
                heading: "Курс не найден.",
                message: "Возможно, его удалили или адрес указан неверно.",
                year: new Date().getFullYear()
            });
        }

        res.render("film", {
            title: course.title,
            course: course,
            enrollmentMessage: req.query.enrolled ? "Вы записаны на курс. Мы скоро свяжемся с вами." : "",
            enrollmentError: "",
            year: new Date().getFullYear()
        });
    } catch (err) {
        res.status(500).render("404", {
            title: "Ошибка",
            heading: "Не удалось открыть курс.",
            message: "Попробуйте открыть страницу ещё раз.",
            year: new Date().getFullYear()
        });
    }
});

app.post("/film/:id/enroll", async function (req, res) {
    const id = Number(req.params.id);
    let course;
    try {
        course = await db.getCollection("courses").findOne({ id: id }, { projection: { _id: 0 } });
        if (!course) {
            return res.status(404).render("404", {
                title: "Курс не найден",
                heading: "Курс не найден.",
                message: "Нельзя записаться на отсутствующий курс.",
                year: new Date().getFullYear()
            });
        }

        const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
        const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
        if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).render("film", {
                title: course.title,
                course: course,
                enrollmentMessage: "",
                enrollmentError: "Укажите имя и корректный email.",
                year: new Date().getFullYear()
            });
        }

        const enrollments = JSON.parse(fs.readFileSync(ENROLLMENTS_FILE, "utf8"));
        const alreadyEnrolled = enrollments.some(enrollment =>
            enrollment.courseId === id && enrollment.email.toLowerCase() === email
        );
        if (alreadyEnrolled) {
            return res.status(409).render("film", {
                title: course.title,
                course: course,
                enrollmentMessage: "",
                enrollmentError: "Этот email уже записан на курс.",
                year: new Date().getFullYear()
            });
        }

        const maxId = enrollments.reduce((max, enrollment) => Math.max(max, enrollment.id), 0);
        enrollments.push({
            id: maxId + 1,
            name: name,
            email: email,
            courseId: id,
            registeredAt: new Date().toISOString()
        });
        fs.writeFileSync(ENROLLMENTS_FILE, JSON.stringify(enrollments, null, 2), "utf8");
        res.redirect(303, `/film/${id}?enrolled=1`);
    } catch (err) {
        res.status(500).render("film", {
            title: course ? course.title : "Ошибка записи",
            course: course,
            enrollmentMessage: "",
            enrollmentError: "Не удалось сохранить запись. Попробуйте позже.",
            year: new Date().getFullYear()
        });
    }
});

app.get(courseCollectionRoutes, async function (req, res) {
    try {
        let courses = await readCourses();
        const category = req.query.category || req.query.genre;
        if (category) {
            courses = courses.filter(course => course.category === category);
        }
        if (req.query.q) {
            const query = req.query.q.toLowerCase();
            courses = courses.filter(course =>
                `${course.title} ${course.description} ${course.instructor}`.toLowerCase().includes(query)
            );
        }
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: "Не удалось прочитать данные" });
    }
});

app.get(["/api/items/:id", "/api/courses/:id"], async function (req, res) {
    try {
        const id = Number(req.params.id);
        const course = await db.getCollection("courses").findOne({ id: id }, { projection: { _id: 0 } });
        if (!course) {
            return res.status(404).json({ error: "Курс не найден" });
        }
        res.json(course);
    } catch (err) {
        res.status(500).json({ error: "Не удалось прочитать данные" });
    }
});

app.post(courseCollectionRoutes, async function (req, res) {
    const courseData = req.body;
    const problems = validateCourse(courseData);
    if (problems.length > 0) {
        return res.status(400).json({ error: "Данные заполнены неверно", problems: problems });
    }

    try {
        const courses = await readCourses();
        const maxId = courses.reduce((max, course) => Math.max(max, course.id), 0);
        const newCourse = createCourse(courseData, maxId + 1);
        await db.getCollection("courses").insertOne(newCourse);
        res.status(201).json(newCourse);
    } catch (err) {
        res.status(500).json({ error: "Не удалось сохранить курс" });
    }
});

app.post("/api/enrollments", async function (req, res) {
    const { name, email, courseId } = req.body || {};
    const courseNumber = Number(courseId);

    if (typeof name !== "string" || name.trim() === "" ||
        typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !Number.isInteger(courseNumber) || courseNumber <= 0) {
        return res.status(400).json({ error: "Укажите имя, корректный email и курс" });
    }

    try {
        const course = await db.getCollection("courses").findOne({ id: courseNumber }, { projection: { _id: 0 } });
        if (!course) {
            return res.status(404).json({ error: "Курс не найден" });
        }

        const enrollments = JSON.parse(fs.readFileSync(ENROLLMENTS_FILE, "utf8"));
        const alreadyEnrolled = enrollments.some(enrollment =>
            enrollment.courseId === courseNumber && enrollment.email.toLowerCase() === email.trim().toLowerCase()
        );
        if (alreadyEnrolled) {
            return res.status(409).json({ error: "Этот email уже записан на курс" });
        }

        const maxId = enrollments.reduce((max, enrollment) => Math.max(max, enrollment.id), 0);
        const enrollment = {
            id: maxId + 1,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            courseId: courseNumber,
            registeredAt: new Date().toISOString()
        };
        enrollments.push(enrollment);
        fs.writeFileSync(ENROLLMENTS_FILE, JSON.stringify(enrollments, null, 2), "utf8");
        res.status(201).json({ message: `Вы записаны на курс «${course.title}»` });
    } catch (err) {
        res.status(500).json({ error: "Не удалось сохранить запись на курс" });
    }
});

//ненайденный маршрут

app.use(function (req, res) {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ error: "Маршрут не найден" });
    }
    res.status(404).render("404", {
        title: "Страница не найдена",
        heading: "Такой страницы нет.",
        message: "Но подходящий курс ещё найдётся.",
        year: new Date().getFullYear()
    });

});

db.connect()
    .then(function () {
        app.listen(PORT, function () {
            console.log(`Сервер запущен: http://localhost:${PORT}`);
        });
    })
    .catch(function (error) {
        console.error("Не удалось подключиться к MongoDB:", error.message);
        process.exitCode = 1;
    });
