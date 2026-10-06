// ==========================================================
// AI INTERVIEW COACH
// COMPLETE SCRIPT
// ==========================================================


// ==========================================================
// HTML ELEMENTS
// ==========================================================

const startBtn = document.getElementById("startBtn");
const startScreen = document.getElementById("startScreen");
const interviewScreen = document.getElementById("interviewScreen");

const speakBtn = document.getElementById("speakBtn");
const micBtn = document.getElementById("micBtn");
const submitBtn = document.getElementById("submitBtn");

const question = document.getElementById("question");
const answer = document.getElementById("answer");
const status = document.getElementById("status");

const roleSelect = document.getElementById("role");
const levelSelect = document.getElementById("level");
const modeSelect = document.getElementById("interviewMode");

const questionNumber =
    document.querySelector(".question-number");


// ==========================================================
// INTERVIEW VARIABLES
// ==========================================================

let questions = [];
let currentQuestion = 0;

let interviewAnswers = [];
let evaluationResults = [];

// Evaluations continue running in the background.
let pendingEvaluations = [];

let currentAnswer = "";


// ==========================================================
// SAFE TEXT
// ==========================================================

function setText(element, text) {

    if (!element) {
        return;
    }

    element.textContent = text ?? "";
}


// ==========================================================
// REMOVE WEIRD TERMINAL / ANSI CHARACTERS
// ==========================================================

function cleanAIText(text) {

    if (text === null || text === undefined) {
        return "";
    }

    let cleaned = String(text);

    // Remove ANSI escape sequences
    cleaned = cleaned.replace(
        /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
        ""
    );

    // Remove literal escaped ANSI sequences
    cleaned = cleaned.replace(
        /\\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/gi,
        ""
    );

    // Remove common terminal fragments
    cleaned = cleaned.replace(
        /\[(?:[0-9;?]*)(?:[A-Za-z])/g,
        ""
    );

    cleaned = cleaned.replace(
        /\[[0-9;?]+[A-Za-z]/g,
        ""
    );

    // Remove replacement characters
    cleaned = cleaned.replace(
        /�+/g,
        ""
    );

    // Remove <think> blocks
    cleaned = cleaned.replace(
        /<think>[\s\S]*?<\/think>/gi,
        ""
    );

    // Remove stray think tags
    cleaned = cleaned.replace(
        /<\/?think>/gi,
        ""
    );

    // Normalize spaces
    cleaned = cleaned.replace(
        /\s+/g,
        " "
    );

    return cleaned.trim();
}


// ==========================================================
// CLEAN QUESTION
// ==========================================================

function cleanQuestion(text) {

    let cleaned = cleanAIText(text);

    if (!cleaned) {
        return "";
    }

    // Remove numbering
    cleaned = cleaned.replace(
        /^\s*(?:question\s*)?\d+\s*[\.\):\-]\s*/i,
        ""
    );

    // Remove markdown bullets
    cleaned = cleaned.replace(
        /^\s*[-*•]\s*/,
        ""
    );

    cleaned = cleaned.trim();

    // Remove excessive dots
    cleaned = cleaned.replace(
        /\.{3,}/g,
        "."
    );

    // Add question mark if necessary
    if (
        cleaned.length > 0 &&
        !/[?!]$/.test(cleaned)
    ) {
        cleaned += "?";
    }

    return cleaned;
}


// ==========================================================
// CHECK ELEMENTS
// ==========================================================

function checkElements() {

    const required = [
        ["startBtn", startBtn],
        ["startScreen", startScreen],
        ["interviewScreen", interviewScreen],
        ["speakBtn", speakBtn],
        ["micBtn", micBtn],
        ["submitBtn", submitBtn],
        ["question", question],
        ["answer", answer],
        ["status", status],
        ["role", roleSelect],
        ["level", levelSelect],
        ["interviewMode", modeSelect],
        ["question-number", questionNumber]
    ];

    const missing =
        required
            .filter(item => !item[1])
            .map(item => item[0]);

    if (missing.length > 0) {

        console.error(
            "Missing HTML elements:",
            missing
        );

        return false;
    }

    return true;
}


// ==========================================================
// START INTERVIEW
// ==========================================================

if (startBtn) {

    startBtn.addEventListener(
        "click",
        startInterview
    );
}


async function startInterview() {

    if (!checkElements()) {

        alert(
            "Some required HTML elements are missing."
        );

        return;
    }

    const role =
        roleSelect.value;

    const level =
        levelSelect.value;
    
    const interviewMode =
        modeSelect.value;

    startBtn.disabled = true;

    setText(
        startBtn,
        "Creating Interview..."
    );

    try {

        const response =
            await fetch(
                "http://127.0.0.1:5000/generate_questions",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        role: role,
                        level: level,
                        mode: interviewMode
                    })
                }
            );

        if (!response.ok) {

            throw new Error(
                "Server returned " +
                response.status
            );
        }

        const data =
            await response.json();

        if (data.error) {

            throw new Error(
                data.error
            );
        }

        if (
            !Array.isArray(
                data.questions
            )
        ) {

            throw new Error(
                "Backend did not return questions."
            );
        }

        if (
            data.questions.length < 5
        ) {

            throw new Error(
                "The AI generated fewer than 5 questions."
            );
        }

        // Keep exactly five questions.
        questions =
            data.questions
                .slice(0, 5)
                .map(cleanQuestion)
                .filter(Boolean);

        if (questions.length !== 5) {

            throw new Error(
                "Some generated questions were empty."
            );
        }

        // Reset everything.
        currentQuestion = 0;

        interviewAnswers = [];

        evaluationResults = [];

        pendingEvaluations = [];

        currentAnswer = "";

        // Remove any old cards.
        removeLiveEvaluation();

        removeFinalReview();

        // Switch screen.
        startScreen.style.display =
            "none";

        interviewScreen.style.display =
            "block";

        // Show first question.
        showQuestion();

    } catch (error) {

        console.error(
            "Question generation error:",
            error
        );

        alert(
            "❌ Couldn't generate the interview.\n\n" +
            error.message
        );

        startBtn.disabled =
            false;

        setText(
            startBtn,
            "Start Interview →"
        );
    }
}


// ==========================================================
// REMOVE LIVE EVALUATION
// ==========================================================

function removeLiveEvaluation() {

    const old =
        document.getElementById(
            "liveEvaluation"
        );

    if (old) {
        old.remove();
    }
}


// ==========================================================
// REMOVE FINAL REVIEW
// ==========================================================

function removeFinalReview() {

    const old =
        document.getElementById(
            "finalReview"
        );

    if (old) {
        old.remove();
    }
}


// ==========================================================
// SHOW QUESTION
// ==========================================================

function showQuestion() {

    removeLiveEvaluation();

    if (!questions.length) {

        console.error(
            "No questions available."
        );

        return;
    }

    if (
        currentQuestion < 0 ||
        currentQuestion >= questions.length
    ) {

        return;
    }

    const current =
        questions[currentQuestion];

    // Question
    setText(
        question,
        current
    );

    // Number
    setText(
        questionNumber,
        `Question ${currentQuestion + 1} of ${questions.length}`
    );

    // Reset answer
    currentAnswer = "";

    setText(
        answer,
        "Your spoken answer will appear here..."
    );

    // Status
    setText(
        status,
        "Click 'Hear Question' or start speaking."
    );

    // Enable submit
    submitBtn.disabled =
        false;

    // Reset mic
    setText(
        micBtn,
        "🎤 Start Speaking"
    );

    // Make sure the question is visible.
    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    // Speak question
    setTimeout(
        speakQuestion,
        250
    );
}


// ==========================================================
// SPEAK QUESTION
// ==========================================================

function speakQuestion() {

    if (!question) {
        return;
    }

    const text =
        cleanAIText(
            question.textContent
        );

    if (!text) {
        return;
    }

    if (
        !window.speechSynthesis
    ) {
        return;
    }

    window.speechSynthesis.cancel();

    const speech =
        new SpeechSynthesisUtterance(
            text
        );

    speech.rate =
        0.9;

    speech.pitch =
        1;

    speech.volume =
        1;

    window.speechSynthesis.speak(
        speech
    );
}


// ==========================================================
// HEAR BUTTON
// ==========================================================

if (speakBtn) {

    speakBtn.addEventListener(
        "click",
        speakQuestion
    );
}


// ==========================================================
// SPEECH RECOGNITION
// ==========================================================

const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

let recognition = null;

let isListening = false;

let finalTranscript = "";


if (SpeechRecognition) {

    recognition =
        new SpeechRecognition();

    recognition.lang =
        "en-IN";

    recognition.continuous =
        true;

    recognition.interimResults =
        true;


    // ------------------------------------------------------
    // MIC BUTTON
    // ------------------------------------------------------

    if (micBtn) {

        micBtn.addEventListener(
            "click",
            function () {

                if (isListening) {

                    stopListening();

                } else {

                    startListening();

                }

            }
        );
    }


    // ------------------------------------------------------
    // START LISTENING
    // ------------------------------------------------------

    function startListening() {

        finalTranscript =
            "";

        currentAnswer =
            "";

        setText(
            answer,
            ""
        );

        try {

            recognition.start();

            isListening =
                true;

            setText(
                micBtn,
                "🔴 Stop Speaking"
            );

            setText(
                status,
                "🎙️ Listening... Take your time."
            );

        } catch (error) {

            console.log(
                "Recognition already running."
            );
        }
    }


    // ------------------------------------------------------
    // STOP LISTENING
    // ------------------------------------------------------

    function stopListening() {

        try {

            recognition.stop();

        } catch (error) {

            console.log(error);
        }
    }


    // ------------------------------------------------------
    // SPEECH RESULT
    // ------------------------------------------------------

    recognition.onresult =
        function (event) {

            let interimTranscript =
                "";

            for (
                let i = event.resultIndex;
                i < event.results.length;
                i++
            ) {

                const text =
                    event.results[i][0]
                        .transcript;

                if (
                    event.results[i].isFinal
                ) {

                    finalTranscript +=
                        text + " ";

                } else {

                    interimTranscript +=
                        text;
                }
            }

            currentAnswer =
                (
                    finalTranscript +
                    interimTranscript
                ).trim();

            setText(
                answer,
                currentAnswer ||
                "Listening..."
            );
        };


    // ------------------------------------------------------
    // SPEECH END
    // ------------------------------------------------------

    recognition.onend =
        function () {

            isListening =
                false;

            setText(
                micBtn,
                "🎤 Start Speaking"
            );

            if (
                currentAnswer.trim()
            ) {

                setText(
                    status,
                    "Answer captured. Review it and submit."
                );

            } else {

                setText(
                    status,
                    "No answer detected. Try again."
                );
            }
        };


    // ------------------------------------------------------
    // SPEECH ERROR
    // ------------------------------------------------------

    recognition.onerror =
        function (event) {

            console.error(
                "Speech recognition error:",
                event.error
            );

            isListening =
                false;

            setText(
                micBtn,
                "🎤 Start Speaking"
            );

            if (
                event.error ===
                "not-allowed"
            ) {

                setText(
                    status,
                    "Microphone permission was denied."
                );

            } else {

                setText(
                    status,
                    "Speech recognition error. Please try again."
                );
            }
        };


} else {

    setText(
        micBtn,
        "🎤 Speech Not Supported"
    );

    if (micBtn) {
        micBtn.disabled = true;
    }

    setText(
        status,
        "Speech recognition is not supported in this browser."
    );
}


// ==========================================================
// SUBMIT ANSWER
// ==========================================================

if (submitBtn) {

    submitBtn.addEventListener(
        "click",
        submitAnswer
    );
}


async function submitAnswer() {

    let userAnswer =
        currentAnswer.trim();


    // Fallback
    if (
        !userAnswer &&
        answer
    ) {

        const displayed =
            answer.textContent.trim();

        if (
            displayed &&
            displayed !==
            "Your spoken answer will appear here..."
        ) {

            userAnswer =
                displayed;
        }
    }


    if (!userAnswer) {

        alert(
            "🎤 Please answer the question first."
        );

        return;
    }


    const role =
        roleSelect.value;

    const interviewMode =
        modeSelect.value;



    // IMPORTANT:
    // Save the question index before moving forward.
    const questionIndex =
        currentQuestion;


    const current =
        questions[questionIndex];


    // ------------------------------------------------------
    // SAVE ANSWER IMMEDIATELY
    // ------------------------------------------------------

    interviewAnswers[questionIndex] = {

        question:
            current,

        answer:
            userAnswer
    };


    // Stop recognition.
    if (isListening) {
        stopListening();
    }


    // Stop question speech.
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }


    // Disable submit for this question.
    submitBtn.disabled =
        true;


    // ======================================================
    // START EVALUATION IN BACKGROUND
    // ======================================================
    //
    // DO NOT await this.
    //
    // The evaluation can take 45-60 seconds,
    // but that must NOT stop the interview.
    // ======================================================

    const evaluationPromise =
        evaluateAnswerInBackground(
            role,
            current,
            userAnswer,
            questionIndex,
            interviewMode
        );


    pendingEvaluations.push(
        evaluationPromise
    );


    // ======================================================
    // MOVE TO NEXT QUESTION IMMEDIATELY
    // ======================================================

    currentQuestion++;


    if (
        currentQuestion <
        questions.length
    ) {

        setText(
            status,
            "Answer saved. Next question..."
        );

        // ZERO waiting for evaluation.
        showQuestion();

    } else {

        // ==================================================
        // Q5 FINISHED
        // ==================================================
        //
        // The final review is displayed immediately.
        // Evaluations continue in the background.
        // ==================================================

        await finishInterview();
    }
}


// ==========================================================
// BACKGROUND EVALUATION
// ==========================================================

async function evaluateAnswerInBackground(
    role,
    current,
    userAnswer,
    questionIndex,
    interviewMode
) {

    try {

        const response =
            await fetch(
                "http://127.0.0.1:5000/evaluate",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        role:
                            role,
                         level:
                            levelSelect.value,
                         mode:
                            interviewMode,

                        question:
                            current,

                        answer:
                            userAnswer

                    })
                }
            );


        if (!response.ok) {

            throw new Error(
                "Server returned " +
                response.status
            );
        }


        const feedback =
            await response.json();


        if (feedback.error) {

            throw new Error(
                feedback.error
            );
        }


        // Normalize AI evaluation.
        const normalized =
            normalizeFeedback(
                feedback,
                userAnswer
            );


        // VERY IMPORTANT:
        //
        // Store the evaluation using its question index.
        //
        // Q3 might finish before Q1.
        // This prevents results from being mixed up.
        evaluationResults[questionIndex] =
            normalized;


        console.log(
            `Evaluation completed for Question ${questionIndex + 1}`
        );


        // If the final review is already visible,
        // refresh it with the newly completed result.
        if (
            document.getElementById(
                "finalReview"
            )
        ) {

            createFinalReview();
        }


        return normalized;


    } catch (error) {

        console.error(
            `Evaluation error for Question ${questionIndex + 1}:`,
            error
        );


        // Create a safe fallback.
        const fallback =
            createFallbackEvaluation(
                userAnswer
            );


        evaluationResults[questionIndex] =
            fallback;


        // Refresh final review if it is visible.
        if (
            document.getElementById(
                "finalReview"
            )
        ) {

            createFinalReview();
        }


        return fallback;
    }
}


// ==========================================================
// FALLBACK EVALUATION
// ==========================================================

function createFallbackEvaluation(
    userAnswer
) {

    const dontKnow =
        isDontKnow(userAnswer);


    if (dontKnow) {

        return {

            overall_score:
                0,

            communication:
                0,

            technical_knowledge:
                0,

            relevance:
                0,

            clarity:
                0,

            confidence:
                0,

            strengths: [
                "You were honest instead of inventing an answer.",
                "You recognized that you need to strengthen this topic."
            ],

            weaknesses: [
                "You did not demonstrate technical knowledge for this question.",
                "You need more familiarity with the underlying concept."
            ],

            improvement:
                "Study the core concept behind this question and practice explaining it with a simple example.",

            ideal_answer:
                "I would start by explaining the core concept clearly, then describe how it works and give a simple practical example."
        };
    }


    return {

        overall_score:
            0,

        communication:
            0,

        technical_knowledge:
            0,

        relevance:
            0,

        clarity:
            0,

        confidence:
            0,

        strengths: [
            "You attempted to answer the question."
        ],

        weaknesses: [
            "The answer could not be evaluated because the AI evaluation failed."
        ],

        improvement:
            "Try answering with a clear explanation and a relevant example.",

        ideal_answer:
            "I would answer the question directly, explain my reasoning clearly, and support the explanation with a practical example."
    };
}


// ==========================================================
// NORMALIZE FEEDBACK
// ==========================================================

function normalizeFeedback(
    feedback,
    userAnswer
) {

    const communication =
        toScore(
            feedback.communication
        ) ?? 0;


    const technical =
        toScore(
            feedback.technical_knowledge
        ) ?? 0;


    const relevance =
        toScore(
            feedback.relevance
        ) ?? 0;


    const clarity =
        toScore(
            feedback.clarity
        ) ?? 0;


    const confidence =
        toScore(
            feedback.confidence
        ) ?? 0;


    let overall =
        toScore(
            feedback.overall_score
        );


    const dontKnow =
        isDontKnow(
            userAnswer
        );


    // If user says I don't know:
    // technical knowledge MUST be zero.
    if (dontKnow) {

        const calculatedOverall =
            (
                (
                    communication +
                    0 +
                    relevance +
                    clarity +
                    confidence
                ) / 5
            ).toFixed(1);


        return {

            overall_score:
                Number(
                    calculatedOverall
                ),

            communication:
                communication,

            technical_knowledge:
                0,

            relevance:
                relevance,

            clarity:
                clarity,

            confidence:
                confidence,

            strengths: [

                "You were honest instead of inventing an answer.",

                "You recognized that you need to strengthen this topic."

            ],

            weaknesses: [

                "You did not demonstrate technical knowledge for this question.",

                "You need more familiarity with the underlying concept."

            ],

            improvement:
                "Study the core concept behind this question and practice explaining it with a simple example.",

            ideal_answer:
                cleanAIText(
                    feedback.ideal_answer ||
                    "I would first explain the core concept, then describe how it works and give a simple practical example."
                )

        };
    }


    // Calculate overall if backend didn't provide it.
    if (overall === null) {

        overall =
            Number(
                (
                    (
                        communication +
                        technical +
                        relevance +
                        clarity +
                        confidence
                    ) / 5
                ).toFixed(1)
            );
    }


    let strengths =
        Array.isArray(
            feedback.strengths
        )
            ? feedback.strengths
            : [];


    let weaknesses =
        Array.isArray(
            feedback.weaknesses
        )
            ? feedback.weaknesses
            : [];


    strengths =
        strengths
            .map(cleanAIText)
            .filter(Boolean);


    weaknesses =
        weaknesses
            .map(cleanAIText)
            .filter(Boolean);


    if (
        strengths.length === 0
    ) {

        strengths = [
            "You attempted to answer the question.",
            "You communicated your response."
        ];
    }


    if (
        weaknesses.length === 0
    ) {

        weaknesses = [
            "Your answer could include more specific detail.",
            "Your explanation could be more structured."
        ];
    }


    const improvement =
        cleanAIText(
            feedback.improvement ||
            "Explain your reasoning clearly and support your answer with a relevant example."
        );


    const idealAnswer =
        cleanAIText(
            feedback.ideal_answer ||
            "I would answer the question directly, explain my reasoning clearly, and include a relevant practical example."
        );


    return {

        overall_score:
            overall,

        communication:
            communication,

        technical_knowledge:
            technical,

        relevance:
            relevance,

        clarity:
            clarity,

        confidence:
            confidence,

        strengths:
            strengths.slice(0, 3),

        weaknesses:
            weaknesses.slice(0, 3),

        improvement:
            improvement,

        ideal_answer:
            idealAnswer

    };
}


// ==========================================================
// SCORE
// ==========================================================

function toScore(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return null;
    }


    const number =
        parseFloat(value);


    if (
        Number.isNaN(number)
    ) {

        return null;
    }


    return Math.max(
        0,
        Math.min(
            10,
            Number(
                number.toFixed(1)
            )
        )
    );
}


// ==========================================================
// DON'T KNOW
// ==========================================================

function isDontKnow(text) {

    const value =
        String(
            text || ""
        )
            .toLowerCase()
            .trim();


    const phrases = [

        "i don't know",

        "i dont know",

        "don't know",

        "dont know",

        "no idea",

        "not sure",

        "i am not sure",

        "i'm not sure",

        "i have no idea",

        "i cannot answer",

        "i can't answer",

        "i do not know",

        "i don't remember",

        "i dont remember"

    ];


    return phrases.some(
        phrase =>
            value.includes(phrase)
    );
}


// ==========================================================
// FINISH INTERVIEW
// ==========================================================

async function finishInterview() {

    removeLiveEvaluation();


    if (
        window.speechSynthesis
    ) {

        window.speechSynthesis.cancel();
    }


    // ======================================================
    // SHOW FINAL REVIEW IMMEDIATELY
    // ======================================================

    setText(
        question,
        "🎉 Interview Complete!"
    );


    setText(
        questionNumber,
        "5 of 5 questions completed"
    );


    setText(
        answer,
        "Great job! Your interview is complete."
    );


    setText(
        status,
        "Your final interview review is being prepared..."
    );


    if (speakBtn) {

        speakBtn.style.display =
            "none";
    }


    if (micBtn) {

        micBtn.style.display =
            "none";
    }


    if (submitBtn) {

        submitBtn.style.display =
            "none";
    }


    // ======================================================
    // IMPORTANT:
    //
    // DO NOT WAIT FOR EVALUATIONS HERE.
    //
    // The final review appears NOW.
    // ======================================================

    createFinalReview();


    // ======================================================
    // WAIT IN THE BACKGROUND
    //
    // When each evaluation completes,
    // evaluateAnswerInBackground() automatically
    // refreshes the final review.
    // ======================================================

    await Promise.allSettled(
        pendingEvaluations
    );


    // Make sure every question has a result.
    for (
        let i = 0;
        i < questions.length;
        i++
    ) {

        if (
            !evaluationResults[i]
        ) {

            evaluationResults[i] =
                createFallbackEvaluation(
                    interviewAnswers[i]
                        ? interviewAnswers[i].answer
                        : ""
                );
        }
    }


    // Final refresh with all results.
    createFinalReview();


    setText(
        status,
        "Your final interview review is ready."
    );
}


// ==========================================================
// FINAL REVIEW
// ==========================================================

function createFinalReview() {

    removeFinalReview();


    const review =
        document.createElement(
            "div"
        );


    review.id =
        "finalReview";


    review.className =
        "evaluation-card";


    // ------------------------------------------------------
    // CALCULATE AVAILABLE SCORES
    // ------------------------------------------------------

    let totalOverall = 0;

    let totalCommunication = 0;

    let totalTechnical = 0;

    let totalRelevance = 0;

    let totalClarity = 0;

    let totalConfidence = 0;

    let completedCount = 0;


    evaluationResults.forEach(
        result => {

            if (!result) {
                return;
            }

            completedCount++;


            totalOverall +=
                Number(
                    result.overall_score || 0
                );


            totalCommunication +=
                Number(
                    result.communication || 0
                );


            totalTechnical +=
                Number(
                    result.technical_knowledge || 0
                );


            totalRelevance +=
                Number(
                    result.relevance || 0
                );


            totalClarity +=
                Number(
                    result.clarity || 0
                );


            totalConfidence +=
                Number(
                    result.confidence || 0
                );

        }
    );


    // ------------------------------------------------------
    // SHOW "EVALUATING..." UNTIL RESULTS EXIST
    // ------------------------------------------------------

    const averageOverall =
        completedCount > 0
            ? (
                totalOverall /
                completedCount
            ).toFixed(1)
            : "—";


    const averageCommunication =
        completedCount > 0
            ? (
                totalCommunication /
                completedCount
            ).toFixed(1)
            : "—";


    const averageTechnical =
        completedCount > 0
            ? (
                totalTechnical /
                completedCount
            ).toFixed(1)
            : "—";


    const averageRelevance =
        completedCount > 0
            ? (
                totalRelevance /
                completedCount
            ).toFixed(1)
            : "—";


    const averageClarity =
        completedCount > 0
            ? (
                totalClarity /
                completedCount
            ).toFixed(1)
            : "—";


    const averageConfidence =
        completedCount > 0
            ? (
                totalConfidence /
                completedCount
            ).toFixed(1)
            : "—";


    // ------------------------------------------------------
    // FINAL REVIEW HTML
    // ------------------------------------------------------

    review.innerHTML = `

        <div class="evaluation-header">

            <h2>🎓 Final Interview Review</h2>

            <p>
                Your complete interview performance.
            </p>

        </div>


        <div class="score-grid">

            <div class="score-card">
                <span>Overall</span>
                <strong>${averageOverall}/10</strong>
            </div>


            <div class="score-card">
                <span>Communication</span>
                <strong>${averageCommunication}/10</strong>
            </div>


            <div class="score-card">
                <span>Technical</span>
                <strong>${averageTechnical}/10</strong>
            </div>


            <div class="score-card">
                <span>Relevance</span>
                <strong>${averageRelevance}/10</strong>
            </div>


            <div class="score-card">
                <span>Clarity</span>
                <strong>${averageClarity}/10</strong>
            </div>


            <div class="score-card">
                <span>Confidence</span>
                <strong>${averageConfidence}/10</strong>
            </div>

        </div>


        <div class="feedback-columns">

            <div class="feedback-section">

                <h3>Overall Strengths</h3>

                <ul>

                    ${getAllStrengths()
                        .map(
                            item =>
                                `<li>${escapeHtml(item)}</li>`
                        )
                        .join("")}

                </ul>

            </div>


            <div class="feedback-section">

                <h3>Areas to Improve</h3>

                <ul>

                    ${getAllWeaknesses()
                        .map(
                            item =>
                                `<li>${escapeHtml(item)}</li>`
                        )
                        .join("")}

                </ul>

            </div>

        </div>


        <div class="coach-advice">

            <h3>How to improve</h3>

            <p>
                ${escapeHtml(
                    getImprovementSummary()
                )}
            </p>

        </div>


        <div style="margin-top: 25px;">

            ${questions
                .map(
                    (questionText, index) => {

                        // If this evaluation has not finished yet,
                        // show a clean placeholder.
                        const result =
                            evaluationResults[index] ||
                            {
                                overall_score: "—",

                                communication: "—",

                                technical_knowledge: "—",

                                relevance: "—",

                                clarity: "—",

                                confidence: "—",

                                strengths: [
                                    "Evaluation in progress..."
                                ],

                                weaknesses: [
                                    "Evaluation in progress..."
                                ],

                                improvement:
                                    "Your detailed improvement feedback is being prepared...",

                                ideal_answer:
                                    "Your ideal answer is being prepared..."
                            };


                        const savedAnswer =
                            interviewAnswers[index]
                                ? interviewAnswers[index].answer
                                : "";


                        return `

                            <div
                                class="review-card"
                                style="
                                    margin-top: 18px;
                                    padding: 20px;
                                    border-radius: 13px;
                                    background: rgba(255,255,255,0.022);
                                    border: 1px solid rgba(255,255,255,0.055);
                                "
                            >

                                <h3>
                                    Question ${index + 1}
                                </h3>


                                <p
                                    style="
                                        margin-top: 10px;
                                        color: #dce5df;
                                        line-height: 1.7;
                                    "
                                >
                                    ${escapeHtml(
                                        questionText
                                    )}
                                </p>


                                <div
                                    class="answer-box"
                                    style="
                                        margin-top: 14px;
                                    "
                                >

                                    <h3>Your Answer</h3>

                                    <p>
                                        ${escapeHtml(
                                            savedAnswer
                                        )}
                                    </p>

                                </div>


                                <div
                                    class="score-grid"
                                    style="
                                        margin-top: 15px;
                                    "
                                >

                                    <div class="score-card">
                                        <span>Overall</span>

                                        <strong>
                                            ${result.overall_score}/10
                                        </strong>
                                    </div>


                                    <div class="score-card">
                                        <span>Communication</span>

                                        <strong>
                                            ${result.communication}/10
                                        </strong>
                                    </div>


                                    <div class="score-card">
                                        <span>Technical</span>

                                        <strong>
                                            ${result.technical_knowledge}/10
                                        </strong>
                                    </div>


                                    <div class="score-card">
                                        <span>Relevance</span>

                                        <strong>
                                            ${result.relevance}/10
                                        </strong>
                                    </div>


                                    <div class="score-card">
                                        <span>Clarity</span>

                                        <strong>
                                            ${result.clarity}/10
                                        </strong>
                                    </div>


                                    <div class="score-card">
                                        <span>Confidence</span>

                                        <strong>
                                            ${result.confidence}/10
                                        </strong>
                                    </div>

                                </div>


                                <div class="feedback-columns">

                                    <div class="feedback-section">

                                        <h3>Strengths</h3>

                                        <ul>

                                            ${result.strengths
                                                .map(
                                                    item =>
                                                        `<li>${escapeHtml(item)}</li>`
                                                )
                                                .join("")}

                                        </ul>

                                    </div>


                                    <div class="feedback-section">

                                        <h3>Weaknesses</h3>

                                        <ul>

                                            ${result.weaknesses
                                                .map(
                                                    item =>
                                                        `<li>${escapeHtml(item)}</li>`
                                                )
                                                .join("")}

                                        </ul>

                                    </div>

                                </div>


                                <div class="coach-advice">

                                    <h3>How to improve</h3>

                                    <p>
                                        ${escapeHtml(
                                            result.improvement
                                        )}
                                    </p>

                                </div>


                                <div class="ideal-answer">

                                    <h3>Ideal Answer</h3>

                                    <p>
                                        ${escapeHtml(
                                            result.ideal_answer
                                        )}
                                    </p>

                                </div>

                            </div>

                        `;

                    }
                )
                .join("")}

        </div>

    `;


    interviewScreen.appendChild(
        review
    );


    // Scroll to the review only when it is first displayed.
    setTimeout(
        function () {

            review.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

        },
        200
    );
}


// ==========================================================
// COLLECT STRENGTHS
// ==========================================================

function getAllStrengths() {

    const all = [];


    evaluationResults.forEach(
        result => {

            if (!result) {
                return;
            }


            result.strengths.forEach(
                item => {

                    if (
                        !all.includes(item)
                    ) {

                        all.push(item);

                    }

                }
            );

        }
    );


    if (
        all.length === 0
    ) {

        return [
            "Your strengths will appear here as the interview evaluations finish."
        ];
    }


    return all.slice(0, 6);
}


// ==========================================================
// COLLECT WEAKNESSES
// ==========================================================

function getAllWeaknesses() {

    const all = [];


    evaluationResults.forEach(
        result => {

            if (!result) {
                return;
            }


            result.weaknesses.forEach(
                item => {

                    if (
                        !all.includes(item)
                    ) {

                        all.push(item);

                    }

                }
            );

        }
    );


    if (
        all.length === 0
    ) {

        return [
            "Your improvement areas will appear here as the interview evaluations finish."
        ];
    }


    return all.slice(0, 6);
}


// ==========================================================
// IMPROVEMENT SUMMARY
// ==========================================================

function getImprovementSummary() {

    const improvements = [];


    evaluationResults.forEach(
        result => {

            if (!result) {
                return;
            }


            if (
                result.improvement &&
                !improvements.includes(
                    result.improvement
                )
            ) {

                improvements.push(
                    result.improvement
                );

            }

        }
    );


    if (
        improvements.length === 0
    ) {

        return "Your personalized improvement suggestions are being prepared.";
    }


    return improvements
        .slice(0, 3)
        .join(" ");
}


// ==========================================================
// ESCAPE HTML
// ==========================================================

function escapeHtml(value) {

    const div =
        document.createElement(
            "div"
        );


    div.textContent =
        cleanAIText(
            value
        );


    return div.innerHTML;
}