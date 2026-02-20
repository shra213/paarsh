// import express from 'express';
import {
    createTest,
    getMyTests,
    getActiveTests, // Added
    getTestById,
    startTest,
    submitTest,
    updateTest,
    deleteTest,
    publishTest
} from '../Controller/testController.js';
import Enrollment from '../models/enrollmentSchema.js'
import express from 'express';
import { auth, requireTeacher, requireStudent } from '../middlewares/auth.js';
import { validateTest } from '../middlewares/validation.js';
import Test from '../models/Test.js';
import Question from '../models/Question.js';
import Result from '../models/Result.js';
import mongoose from 'mongoose';
// import { getActiveTests } from '../Controller/testController.js';
const router = express.Router();
import Subject from '../models/subject.js';
router.post('/addSubject', requireTeacher, async (req, res) => {
    try {
        const teacher = req.user.id;
        const { subject } = req.body;

        if (!subject) {
            console.log(subject)
            return res.status(400).json({
                message: 'Subject is required'
            });
        }

        // check if teacher already has this subject
        const existingSubject = await Subject.findOne({
            name: subject,
            teacher
        });

        if (existingSubject) {
            return res.status(409).json({
                message: 'You already teach this subject'
            });
        }
        const generateCode = () =>
            Math.floor(1000 + Math.random() * 9000).toString();

        const MAX_RETRIES = 10;
        let attempts = 0;
        let sub;

        while (!sub && attempts < MAX_RETRIES) {
            attempts++;
            try {
                sub = await Subject.create({
                    name: subject,
                    teacher: teacher,
                    code: generateCode()
                });
            } catch (err) {
                if (err.code !== 11000) throw err;
            }
        }

        if (!sub) {
            throw new Error("Unable to generate unique teacher code");
        }

        return res.status(201).json({
            message: 'Subject added successfully',
            subject: sub
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Server error'
        });
    }
});


router.post('/', auth, requireTeacher, validateTest, async (req, res) => {
    try {
        const test = new Test({
            ...req.body, // title, description, duration, type
            status: 'draft',
            createdBy: req.user.id
        });

        await test.save();
        await test.populate('questions');

        res.status(201).json(test);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

router.get('/fetch-active', auth, requireStudent, getActiveTests);

router.get('/my-tests', auth, requireTeacher, async (req, res) => {
    try {
        const tests = await Test.find({ createdBy: req.user.id })
            .populate('questions')
            .sort({ createdAt: -1 });
        res.json(tests);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});
router.get('/list-subjects', auth, requireTeacher, async (req, res) => {
    try {
        const subjects = await Subject.find({
            teacher: req.user.id
        })
            .select('name code')
            .sort({ createdAt: -1 });

        console.log(subjects)
        res.status(200).json(subjects);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: 'Server error'
        });
    }
});

//subjectwise tests for teacher
router.get('/subject/:id', auth, requireTeacher, async (req, res) => {
    try {
        const subjectId = req.params.id;

        const query = {
            createdBy: req.user.id
        };

        if (subjectId) {
            query.subject = subjectId;
        }

        const tests = await Test.find(query)
            .populate('questions')
            .populate('subject', 'name')
            .sort({ createdAt: -1 });

        res.json(tests);

    } catch (error) {
        res.status(500).json({
            message: 'Server error',
            error: error.message
        });
    }
});

router.get("/subject/:id/students", auth, requireTeacher, async (req, res) => {
    try {
        const subjectId = req.params.id;
        console.log(subjectId)
        // 1️⃣ Verify subject belongs to this teacher
        const subject = await Subject.findOne({
            _id: subjectId,
            teacher: req.user.id,
        });

        if (!subject) {
            return res.status(404).json({
                message: "Subject not found or unauthorized",
            });
        }

        // 2️⃣ Get approved enrollments + populate student details
        const enrollments = await Enrollment.find({
            subject: subjectId,
            status: "approved",
        }).populate("student", "name email role");

        // 3️⃣ Extract only students
        const students = enrollments.map((enroll) => enroll.student);

        return res.status(200).json({
            totalStudents: students.length,
            students,
        });
    } catch (error) {
        console.error("GET STUDENTS ERROR:", error);
        return res.status(500).json({
            message: "Server Error",
        });
    }
});

router.delete(
    "/subject/:subjectId/students/:studentId",
    auth,
    requireTeacher,
    async (req, res) => {
        try {
            const { subjectId, studentId } = req.params;

            // 1️⃣ Verify teacher owns subject
            const subject = await Subject.findOne({
                _id: subjectId,
                teacher: req.user.id,
            });

            if (!subject) {
                return res.status(404).json({
                    message: "Subject not found or unauthorized",
                });
            }

            // 2️⃣ Get all test IDs of this subject
            const tests = await Test.find({ subject: subjectId }).select("_id");
            const testIds = tests.map(t => t._id);

            // 3️⃣ Delete student's results for those tests
            await Result.deleteMany({
                test: { $in: testIds },
                student: studentId,
            });

            // 4️⃣ Delete enrollment
            const enrollment = await Enrollment.findOneAndDelete({
                subject: subjectId,
                student: studentId,
            });

            if (!enrollment) {
                return res.status(404).json({
                    message: "Student not enrolled in this subject",
                });
            }

            return res.status(200).json({
                message: "Student removed and related results deleted",
            });

        } catch (error) {
            console.error("REMOVE STUDENT ERROR:", error);
            return res.status(500).json({
                message: "Server Error",
            });
        }
    }
);

router.delete("/subject/:id", auth, requireTeacher, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const subjectId = req.params.id;

        // 1️⃣ Verify subject belongs to teacher
        const subject = await Subject.findOne({
            _id: subjectId,
            teacher: req.user.id,
        }).session(session);

        if (!subject) {
            await session.abortTransaction();
            return res.status(404).json({
                message: "Subject not found or unauthorized",
            });
        }

        // 2️⃣ Get all tests of this subject
        const tests = await Test.find({ subject: subjectId }).session(session);
        const testIds = tests.map((t) => t._id);

        // 3️⃣ Delete results of those tests
        await Result.deleteMany({
            test: { $in: testIds },
        }).session(session);

        await Question.deleteMany({
            _id: { $in: tests.flatMap(t => t.questions) }
        }).session(session);

        // 4️⃣ Delete tests
        await Test.deleteMany({
            subject: subjectId,
        }).session(session);

        // 5️⃣ Delete enrollments
        await Enrollment.deleteMany({
            subject: subjectId,
        }).session(session);

        // 6️⃣ Delete subject
        await Subject.findByIdAndDelete(subjectId).session(session);

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
            message: "Subject and all related data deleted successfully",
        });

    } catch (error) {
        await session.abortTransaction();
        session.endSession();

        console.error("DELETE SUBJECT ERROR:", error);
        return res.status(500).json({
            message: "Server Error",
        });
    }
}
);


router.get('/student/subject/:id', auth, requireStudent, async (req, res) => {
    try {
        const subjectId = req.params.id;
        // 🔒 Only students
        if (req.user.role !== "student") {

            return res.json({ activeTests: [], expiredTests: [] });
        }

        /* --------------------------------------------------
           1️⃣ Check enrollment (approved)
        -------------------------------------------------- */
        console.log(subjectId, req.user._id)
        const isEnrolled = await Enrollment.find({
            student: req.user._id,
            subject: subjectId,
            status: "approved"
        }).populate('subject', 'name');
        console.log(isEnrolled, "enrolled")

        if (!isEnrolled) {

            return res.status(403).json({
                message: "Not enrolled in this subject"
            });
        }

        /* --------------------------------------------------
           2️⃣ Student results
        -------------------------------------------------- */
        const results = await Result.find({
            student: req.user._id
        }).select("test status");
        console.log(results)
        const submittedTestIds = results
            .filter(r => r.status === "submitted")
            .map(r => r.test);

        const inProgressTestIds = results
            .filter(r => r.status === "started")
            .map(r => r.test);
        console.log("subject wise student", submittedTestIds, inProgressTestIds)
        /* --------------------------------------------------
           3️⃣ Fetch subject tests
        -------------------------------------------------- */
        const tests = await Test.find({
            subject: subjectId,
            status: "published",
            $or: [
                { _id: { $nin: submittedTestIds } },
                { _id: { $in: inProgressTestIds } }
            ]
        })
            .populate("createdBy", "name")
            .populate("subject", "name")
            .select(
                "title description duration type startTime endTime createdAt status"
            )
            .sort({ createdAt: -1 });

        /* --------------------------------------------------
           4️⃣ Active / Expired logic
        -------------------------------------------------- */
        const now = Date.now();
        const activeTests = [];
        const expiredTests = [];

        tests.forEach(test => {
            let isActive = false;

            {
                const durationMs = test.duration * 60 * 1000;
                const createdAtMs = new Date(test.createdAt).getTime();

                if (now - createdAtMs <= durationMs) {
                    isActive = true;
                }
            }

            isActive ? activeTests.push(test) : expiredTests.push(test);
        });

        res.json({ activeTests, expiredTests });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Server error",
            error: error.message
        });
    }
});
router.get('/:id', auth, async (req, res) => {
    try {
        const test = await Test.findById(req.params.id).populate('questions');

        if (!test) {
            return res.status(404).json({ message: 'Test not found' });
        }

        /* ---------- STUDENT VIEW ---------- */
        if (req.user.role === 'student') {
            if (test.status === 'draft') {
                return res.status(403).json({ message: 'Test not available' });
            }

            const testWithoutAnswers = {
                _id: test._id,
                title: test.title,
                description: test.description,
                duration: test.duration,
                type: test.type,
                status: test.status,
                currentQuestionIndex: test.currentQuestionIndex,
                questions: test.questions.map(q => ({
                    _id: q._id,
                    questionText: q.questionText,
                    options: q.options.map(opt => ({ text: opt.text })),
                    questionType: q.questionType,
                    marks: q.marks
                }))
            };

            return res.json(testWithoutAnswers);
        }

        /* ---------- TEACHER VIEW ---------- */
        res.json(test);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

const autoSubmit = async (result) => {
    try {
        // Populate questions
        await result.populate('answers.question');

        let score = 0;

        for (const ans of result.answers) {
            const question = await Question
                .findById(ans.question)
                .select('+correctAnswer');

            if (!question) continue;

            let isCorrect = false;

            if (question.questionType === 'fill_in_blank') {
                isCorrect =
                    ans.textAnswer &&
                    question.correctAnswer &&
                    ans.textAnswer.trim().toLowerCase() ===
                    question.correctAnswer.trim().toLowerCase();
            } else {
                isCorrect =
                    question.options[ans.selectedOption]?.isCorrect || false;
            }

            ans.isCorrect = isCorrect;

            if (isCorrect) {
                score += question.marks;
            }
        }

        // Calculate time taken (in seconds)
        const timeTaken = Math.floor(
            (Date.now() - result.createdAt.getTime()) / 1000
        );

        result.score = score;
        result.percentage = (score / result.totalMarks) * 100;
        result.timeTaken = timeTaken;
        result.autoSubmitted = true;
        result.status = 'auto_submitted';
        result.submittedAt = new Date();

        await result.save();
        console.log(`✅ Auto-submitted test for student ${result.student}`);

    } catch (error) {
        console.error('❌ AutoSubmit failed:', error.message);
    }
};

router.post('/:id/start', auth, requireStudent, async (req, res) => {
    try {
        const test = await Test.findById(req.params.id);

        if (!test) {
            return res.status(404).json({ message: 'Test not found' });
        }
        const durationMs = test.duration * 60 * 1000;
        const createdAtMs = new Date(test.createdAt).getTime();
        console.log(createdAtMs, durationMs)
        if (Date.now() - createdAtMs > durationMs) {
            console.log("expired")
            return res.status(403).json({ message: 'test expired' });
        }
        console.log(test);

        // 🔒 Visibility rules
        if (test.status === 'draft' || test.status === 'ended') {
            return res.status(403).json({ message: 'Test not available' });
        }
        console.log(test._id)
        let result = await Result.findOne({
            test: test._id,
            student: req.user.id
        });
        console.log("hii", result);

        if (result && !result.submittedAt) {
            const endTime = result.createdAt.getTime() + test.duration * 60 * 1000;

            if (Date.now() >= endTime) {
                autoSubmit(result);
            }
        }
        console.log("hii", result);


        // 🔁 Resume test
        if (result) {
            console.log("pagal");
            if (result.submittedAt) {
                console.log(result);
                return res.status(400).json({ message: 'Test already attempted' });
            }

            return res.json({
                testId: test._id,
                duration: test.duration,
                totalQuestions: test.questions.length,
                totalMarks: result.totalMarks,
                startTime: result.createdAt,
                isResumed: true,
                type: test.type
            });
        }

        // 🆕 First start
        const questions = await Question.find({
            _id: { $in: test.questions }
        });

        const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);

        result = new Result({
            test: test._id,
            student: req.user.id,
            totalMarks,
            status: 'started',
            lastSeenAt: new Date(),
            answers: test.questions.map(qId => ({
                question: qId
            }))
        });

        await result.save();

        res.json({
            testId: test._id,
            duration: test.duration,
            totalQuestions: test.questions.length,
            totalMarks,
            startTime: result.createdAt,
            type: test.type
        });

    } catch (error) {
        console.log(error)
        res.status(500).json({
            message: 'Server error',
            error: error.message
        });
    }
});


router.post('/:id/submit', auth, requireStudent, async (req, res) => {
    try {
        const { answers, timeTaken, autoSubmitted = false } = req.body;

        const test = await Test.findById(req.params.id);
        if (!test) {
            return res.status(404).json({ message: 'Test not found' });
        }


        const result = await Result.findOne({
            test: test._id,
            student: req.user.id
        }).populate('answers.question');

        if (!result) {
            return res.status(400).json({ message: 'Test not started' });
        }

        if (result.submittedAt) {
            console.log(result)
            console.log("already submitted")
            return res.status(200).json({ message: 'Test already submitted' });
        }

        let score = 0;

        const evaluatedAnswers = await Promise.all(
            answers.map(async ans => {
                const question = await Question
                    .findById(ans.questionId)
                    .select('+correctAnswer');

                if (!question) return null;

                let isCorrect = false;

                if (question.questionType === 'fill_in_blank') {
                    isCorrect =
                        ans.textAnswer &&
                        question.correctAnswer &&
                        ans.textAnswer.trim().toLowerCase() ===
                        question.correctAnswer.trim().toLowerCase();
                } else {
                    isCorrect =
                        question.options[ans.selectedOption]?.isCorrect || false;
                }

                if (isCorrect) score += question.marks;

                return {
                    question: ans.questionId,
                    selectedOption: ans.selectedOption,
                    textAnswer: ans.textAnswer,
                    isCorrect
                };
            })
        );

        result.answers = evaluatedAnswers.filter(Boolean);
        result.score = score;
        result.status = 'submitted';
        result.percentage = (score / result.totalMarks) * 100;
        result.timeTaken = timeTaken;
        result.autoSubmitted = autoSubmitted;
        result.submittedAt = new Date();
        await result.save();
        res.json({ message: 'Test submitted successfully' });

    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: 'Server error',
            error: error.message
        });
    }
});

router.put('/:id', auth, requireTeacher, async (req, res) => {
    try {
        const test = await Test.findById(req.params.id);

        if (!test) return res.status(404).json({ message: 'Test not found' });

        if (test.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        if (test.status !== 'draft') {
            return res.status(400).json({ message: 'Cannot edit published test' });
        }

        const updated = await Test.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('questions');

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

/* =====================================================
   DELETE TEST
===================================================== */
router.delete('/:id', auth, requireTeacher, async (req, res) => {
    try {
        const test = await Test.findById(req.params.id);
        if (!test) return res.status(404).json({ message: 'Test not found' });

        if (test.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        await Test.findByIdAndDelete(req.params.id);
        await Result.deleteMany({ test: req.params.id });
        console.log("delete")
        res.json({ message: 'Test deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

router.put('/:id/publish', auth, requireTeacher, async (req, res) => {
    try {
        console.log("hii");
        const test = await Test.findById(req.params.id);
        if (!test) return res.status(404).json({ message: 'Test not found' });

        if (test.createdBy.toString() !== req.user.id) {
            return res.status(403).json({ message: 'Not authorized' });
        }

        if (test.status !== 'draft') {
            console.log("published");
            console.log(test);
            return res.status(400).json({ message: 'Test already published' });
        }
        test.status = 'published';

        await test.save();

        res.json({ message: 'Test published', test });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

router.put('/:id/start-live', auth, requireTeacher, async (req, res) => {
    try {
        const test = await Test.findById(req.params.id);
        if (!test) return res.status(404).json({ message: 'Test not found' });

        if (test.type !== 'teacher_controlled') {
            return res.status(400).json({ message: 'Not a teacher-controlled test' });
        }

        test.status = 'live';
        test.startTime = new Date();
        test.currentQuestionIndex = 0;

        await test.save();

        res.json({ message: 'Test started', test });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

router.put('/:id/end', auth, requireTeacher, async (req, res) => {
    try {
        console.log(req.params.id);
        const test = await Test.findById(req.params.id);
        if (!test) return res.status(404).json({ message: 'Test not found' });

        test.status = 'ended';
        test.endTime = new Date();
        await test.save();

        res.json({ message: 'Test ended' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

export default router;
