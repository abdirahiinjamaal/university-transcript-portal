const express = require("express");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();

app.use(express.json());

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

/*
 * Health check
 */
app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.status(200).json({
            status: "healthy",
            database: "connected"
        });
    } catch (error) {
        console.error("Database health check failed:", error.message);

        res.status(503).json({
            status: "unhealthy",
            database: "disconnected"
        });
    }
});


/*
 * Get student transcript
 */
app.get("/api/transcript/:studentId", async (req, res) => {
    const { studentId } = req.params;

    try {

        // Get student information
        const [students] = await pool.query(
            `
            SELECT
                student_id,
                first_name,
                last_name,
                email,
                faculty,
                program,
                enrollment_year
            FROM students
            WHERE student_id = ?
            `,
            [studentId]
        );

        if (students.length === 0) {
            return res.status(404).json({
                error: "Student not found"
            });
        }

        // Get academic results
        const [results] = await pool.query(
            `
            SELECT
                c.course_code,
                c.course_name,
                c.credit_hours,
                r.semester,
                r.academic_year,
                r.grade,
                r.grade_point
            FROM results r
            JOIN courses c
                ON r.course_id = c.course_id
            WHERE r.student_id = ?
            ORDER BY
                r.academic_year,
                r.semester,
                c.course_code
            `,
            [studentId]
        );

        // Calculate GPA
        let totalQualityPoints = 0;
        let totalCredits = 0;

        for (const result of results) {
            totalQualityPoints +=
                Number(result.credit_hours) *
                Number(result.grade_point);

            totalCredits += Number(result.credit_hours);
        }

        const gpa =
            totalCredits > 0
                ? Number(
                    (totalQualityPoints / totalCredits).toFixed(2)
                )
                : 0;

        res.status(200).json({
            student: students[0],
            transcript: results,
            summary: {
                total_courses: results.length,
                total_credits: totalCredits,
                gpa: gpa
            }
        });

    } catch (error) {

        console.error("Transcript query failed:", error.message);

        res.status(500).json({
            error: "Internal server error"
        });
    }
});


/*
 * Start server
 */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`University Transcript API running on port ${PORT}`);
});