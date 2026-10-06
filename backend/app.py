from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import re
import urllib.request
import urllib.error


# ==========================================================
# APP
# ==========================================================

app = Flask(__name__)
CORS(app)


# ==========================================================
# SETTINGS
# ==========================================================

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL = "qwen3:0.6b"


# ==========================================================
# CLEAN AI TEXT
# ==========================================================

def clean_ai_text(text):
    if not text:
        return ""

    text = str(text)

    # Remove ANSI / terminal control sequences
    text = re.sub(
        r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])",
        "",
        text
    )

    # Remove Qwen thinking blocks
    text = re.sub(
        r"<think>.*?</think>",
        "",
        text,
        flags=re.DOTALL | re.IGNORECASE
    )

    text = text.replace("<think>", "")
    text = text.replace("</think>", "")

    # Remove replacement character
    text = text.replace("\ufffd", "")

    # Fix common encoding problems
    replacements = {
        "â€™": "'",
        "â€˜": "'",
        "â€œ": '"',
        "â€": '"',
        "â€“": "-",
        "â€”": "-",
        "â€¦": "...",
        "Â": ""
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    return text.strip()


# ==========================================================
# ASK OLLAMA
# ==========================================================

def ask_qwen(prompt, num_predict=600):
    """
    Uses Ollama's local HTTP API instead of the CLI.
    This avoids terminal/control-character garbage and
    lets us explicitly disable thinking.
    """

    payload = {
        "model": MODEL,
        "prompt": prompt,
        "stream": False,
        "think": False,
        "options": {
            "temperature": 0.4,
            "num_predict": num_predict
        }
    }

    body = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_URL,
        data=body,
        headers={
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            raw = response.read().decode("utf-8")
            data = json.loads(raw)

    except urllib.error.HTTPError as error:

        # Some older Ollama versions may not understand "think".
        # Retry once without it.
        if error.code in (400, 404):

            fallback_payload = {
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.4,
                    "num_predict": num_predict
                }
            }

            fallback_body = json.dumps(
                fallback_payload
            ).encode("utf-8")

            fallback_req = urllib.request.Request(
                OLLAMA_URL,
                data=fallback_body,
                headers={
                    "Content-Type": "application/json"
                },
                method="POST"
            )

            with urllib.request.urlopen(
                fallback_req,
                timeout=120
            ) as response:

                raw = response.read().decode("utf-8")
                data = json.loads(raw)

        else:
            raise Exception(
                f"Ollama HTTP error {error.code}: "
                f"{error.read().decode('utf-8', errors='replace')}"
            )

    except urllib.error.URLError as error:

        raise Exception(
            "Could not connect to Ollama. "
            "Make sure Ollama is running."
        ) from error

    result = data.get("response", "")

    return clean_ai_text(result)


# ==========================================================
# CLEAN NORMAL TEXT
# ==========================================================

def clean_text(text):

    if not text:
        return ""

    text = clean_ai_text(text)

    text = text.replace("**", "")
    text = text.replace("__", "")

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


# ==========================================================
# QUESTION VALIDATION
# ==========================================================

def looks_like_complete_question(question):

    if not question:
        return False

    question = clean_text(question)

    # Minimum useful length
    if len(question) < 35:
        return False

    # Must end with a question mark
    if not question.endswith("?"):
        return False

    # Obvious truncation
    bad_endings = [
        " and",
        " or",
        " but",
        " because",
        " such as",
        " including",
        " with",
        " using",
        " for",
        " to",
        " of",
        " in",
        " on",
        " by",
        " that",
        " which",
        " when",
        " where",
        " how"
    ]

    lower = question[:-1].lower().rstrip()

    for ending in bad_endings:
        if lower.endswith(ending):
            return False

    # Reject literal ellipsis
    if "..." in question:
        return False

    # Reject obvious unfinished punctuation
    if question.endswith((",", ":", ";", "-", "—")):
        return False

    return True


# ==========================================================
# EXTRACT QUESTIONS
# ==========================================================

def extract_questions(text):

    text = clean_ai_text(text)

    questions = []

    # First try numbered lines
    for line in text.splitlines():

        line = line.strip()

        if not line:
            continue

        match = re.match(
            r"^\s*(\d+)\s*[\.\)\-:]\s*(.+)$",
            line
        )

        if match:

            question = clean_text(
                match.group(2)
            )

            # Remove accidental surrounding quotes
            question = question.strip('"').strip("'").strip()

            if not question.endswith("?"):
                question += "?"

            if not looks_like_complete_question(question):
                continue

            if question.lower() not in [
                q.lower()
                for q in questions
            ]:
                questions.append(question)

    # If numbered extraction failed, try question sentences
    if len(questions) < 5:

        candidates = re.split(
            r"(?<=\?)\s+",
            text
        )

        for candidate in candidates:

            candidate = candidate.strip()

            candidate = re.sub(
                r"^\s*\d+\s*[\.\)\-:]\s*",
                "",
                candidate
            )

            candidate = clean_text(candidate)

            if not candidate:
                continue

            if not candidate.endswith("?"):
                continue

            if not looks_like_complete_question(candidate):
                continue

            if candidate.lower() not in [
                q.lower()
                for q in questions
            ]:
                questions.append(candidate)

    return questions[:5]


# ==========================================================
# GENERATE QUESTIONS
# ==========================================================

@app.route(
    "/generate_questions",
    methods=["POST"]
)
def generate_questions():

    try:

        data = request.get_json() or {}

        role = data.get(
            "role",
            "Software Developer"
        )

        level = data.get(
            "level",
            "Fresher"
        )
        mode = data.get(
            "mode",
            "Mixed Interview"
        )

        prompt = f"""
You are conducting a real professional job interview.

ROLE: {role}

EXPERIENCE LEVEL: {level}

Generate exactly FIVE different interview questions.

IMPORTANT:

- Every question must be a COMPLETE sentence.
- Every question must end with a question mark.
- Never stop a question halfway through.
- Never use "..."
- Never leave a sentence unfinished.
- Each question must make sense on its own.
- Do not repeat the same concept.
- Do not ask the same scenario twice.
- Questions must be appropriate for the role.
- Questions must match the experience level.
- Interview mode: {mode}
- If the mode is "Technical Interview", ask only technical questions relevant to the role.
- If the mode is "HR Interview", ask only HR, behavioral, situational, communication, teamwork, motivation, and workplace questions. Do not ask technical questions.
- If the mode is "Mixed Interview", use a balanced mixture of technical and behavioral questions.
- Questions should sound like questions a real interviewer would ask.
- Do not provide answers.
- Do not provide explanations.
- Do not add headings.
- Do not add introductions.
- Do not add conclusions.

OUTPUT ONLY THESE FIVE NUMBERED QUESTIONS:

1. Complete interview question?
2. Complete interview question?
3. Complete interview question?
4. Complete interview question?
5. Complete interview question?

Before finishing, check that every question is complete and ends with "?".
"""

        print()
        print("==========================================")
        print("GENERATING INTERVIEW")
        print("==========================================")
        print("Role:", role)
        print("Level:", level)
        print()

        output = ask_qwen(
            prompt,
            num_predict=700
        )

        print("RAW QWEN OUTPUT:")
        print(output)
        print()

        questions = extract_questions(output)

        # One retry if Qwen produced an incomplete response
        if len(questions) != 5:

            print(
                "First generation did not produce "
                "5 complete questions. Retrying..."
            )

            retry_prompt = f"""
Create exactly five complete interview questions
for a {level} candidate applying for a {role} role.
INTERVIEW MODE: {mode}

If the mode is "Technical Interview", ask only technical questions relevant to the role.
If the mode is "HR Interview", ask only HR, behavioral, situational, communication, teamwork, motivation, and workplace questions. Do not ask technical questions.
If the mode is "Mixed Interview", use a balanced mixture of technical and behavioral questions.

Return ONLY five numbered questions.

Every question MUST:
- be a complete sentence
- end with ?
- be at least 35 characters
- contain no "..."
- contain no unfinished phrase
- be different from the other questions

Do not provide anything else.

1. Question?
2. Question?
3. Question?
4. Question?
5. Question?
"""

            retry_output = ask_qwen(
                retry_prompt,
                num_predict=700
            )

            print("RETRY OUTPUT:")
            print(retry_output)
            print()

            questions = extract_questions(
                retry_output
            )

        if len(questions) != 5:

            raise Exception(
                "Qwen could not generate 5 complete "
                "interview questions. Please try again."
            )

        print("FINAL QUESTIONS:")

        for i, question in enumerate(
            questions,
            start=1
        ):
            print(
                f"{i}. {question}"
            )

        print()

        return jsonify({
            "questions": questions
        })

    except Exception as error:

        print()
        print("QUESTION GENERATION ERROR:")
        print(error)
        print()

        return jsonify({
            "error": str(error)
        }), 500


# ==========================================================
# SCORE EXTRACTION
# ==========================================================

def extract_score(text, label):

    patterns = [

        rf"{label}\s*:\s*(\d+(?:\.\d+)?)\s*(?:/10)?",

        rf"{label}\s*=\s*(\d+(?:\.\d+)?)\s*(?:/10)?"

    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE
        )

        if match:

            try:

                value = float(
                    match.group(1)
                )

                return max(
                    0,
                    min(
                        10,
                        value
                    )
                )

            except:
                pass

    return None


# ==========================================================
# SECTION EXTRACTION
# ==========================================================

def extract_section(
    text,
    heading,
    next_headings
):

    if next_headings:

        endings = "|".join(
            re.escape(x)
            for x in next_headings
        )

        pattern = (
            rf"{re.escape(heading)}\s*:\s*"
            rf"(.*?)"
            rf"(?="
            rf"(?:{endings})\s*:|$)"
        )

    else:

        pattern = (
            rf"{re.escape(heading)}\s*:\s*"
            rf"(.*)$"
        )

    match = re.search(
        pattern,
        text,
        flags=re.IGNORECASE | re.DOTALL
    )

    if not match:
        return ""

    return match.group(1).strip()


# ==========================================================
# EXTRACT BULLETS
# ==========================================================

def extract_bullets(text):

    items = []

    for line in text.splitlines():

        line = line.strip()

        line = re.sub(
            r"^[-•*]\s*",
            "",
            line
        )

        line = re.sub(
            r"^\d+[\.\)]\s*",
            "",
            line
        )

        if line:

            items.append(
                clean_text(line)
            )

    return items


# ==========================================================
# DON'T KNOW DETECTION
# ==========================================================

def is_dont_know(answer):

    text = answer.lower().strip()

    phrases = [
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
    ]

    return any(
        phrase in text
        for phrase in phrases
    )


# ==========================================================
# EVALUATE ANSWER
# ==========================================================

@app.route(
    "/evaluate",
    methods=["POST"]
)
def evaluate():

    try:

        data = request.get_json() or {}

        role = data.get(
            "role",
            "Software Developer"
        )
        level = data.get(
            "level",
            "Fresher"
        )
        mode = data.get(
            "mode",
            "Mixed Interview"
        )



        question = data.get(
            "question",
            ""
        )

        answer = data.get(
            "answer",
            ""
        )

        if not answer.strip():

            return jsonify({
                "error": "No answer was provided."
            }), 400

        dont_know = is_dont_know(
            answer
        )

        prompt = f"""
You are a strict but fair professional interview evaluator.

ROLE:
{role}

EXPERIENCE LEVEL:
{level}

INTERVIEW MODE:
{mode}


QUESTION:
{question}

CANDIDATE ANSWER:
{answer}

Evaluate ONLY what the candidate actually said.

Give exactly these five scores from 0 to 10:

COMMUNICATION:
How clearly did the candidate communicate?

TECHNICAL:
How much correct technical knowledge did the candidate demonstrate? For HR Interview questions, score this based on any role-related knowledge demonstrated, but do not penalize the candidate for not giving a technical answer.

RELEVANCE:
How directly did the candidate answer the question?

CLARITY:
How easy was the answer to understand?

CONFIDENCE:
How confidently did the candidate express the answer?

RULES:

1. Never assume knowledge the candidate did not demonstrate.
2. If the candidate says they don't know, technical must be 0.
3. Evaluate the other categories separately.
4. Give exactly two concise strengths.
5. Give exactly two concise weaknesses.
6. Give specific improvement advice.
7. Give an actual ideal answer to THIS exact question.
8. The ideal answer must be something a candidate could realistically say.
9. The ideal answer must directly answer the question.
10. Keep the ideal answer to 4-6 natural sentences.
11. Do not explain your reasoning.

RETURN EXACTLY THIS FORMAT:

COMMUNICATION: X/10
TECHNICAL: X/10
RELEVANCE: X/10
CLARITY: X/10
CONFIDENCE: X/10

STRENGTHS:
- First strength
- Second strength

WEAKNESSES:
- First weakness
- Second weakness

IMPROVEMENT:
Specific improvement advice.

IDEAL ANSWER:
A natural first-person answer to the actual interview question.
"""

        print()
        print("==========================================")
        print("EVALUATING ANSWER")
        print("==========================================")
        print("Question:")
        print(question)
        print()
        print("Candidate answer:")
        print(answer)
        print()

        output = ask_qwen(
            prompt,
            num_predict=700
        )

        print("RAW EVALUATION:")
        print(output)
        print()

        # ==================================================
        # SCORES
        # ==================================================

        communication = extract_score(
            output,
            "COMMUNICATION"
        )

        technical = extract_score(
            output,
            "TECHNICAL"
        )

        relevance = extract_score(
            output,
            "RELEVANCE"
        )

        clarity = extract_score(
            output,
            "CLARITY"
        )

        confidence = extract_score(
            output,
            "CONFIDENCE"
        )

        # ==================================================
        # FALLBACKS
        # ==================================================

        if communication is None:
            communication = 0

        if technical is None:
            technical = 0

        if relevance is None:
            relevance = 0

        if clarity is None:
            clarity = 0

        if confidence is None:
            confidence = 0

        # ==================================================
        # FORCE TECHNICAL ZERO
        # ==================================================

        if dont_know:
            technical = 0

        # ==================================================
        # STRENGTHS
        # ==================================================

        strengths_text = extract_section(
            output,
            "STRENGTHS",
            [
                "WEAKNESSES",
                "IMPROVEMENT",
                "IDEAL ANSWER"
            ]
        )

        strengths = extract_bullets(
            strengths_text
        )

        # ==================================================
        # WEAKNESSES
        # ==================================================

        weaknesses_text = extract_section(
            output,
            "WEAKNESSES",
            [
                "IMPROVEMENT",
                "IDEAL ANSWER"
            ]
        )

        weaknesses = extract_bullets(
            weaknesses_text
        )

        # ==================================================
        # IMPROVEMENT
        # ==================================================

        improvement = extract_section(
            output,
            "IMPROVEMENT",
            [
                "IDEAL ANSWER"
            ]
        )

        improvement = clean_text(
            improvement
        )

        # ==================================================
        # IDEAL ANSWER
        # ==================================================

        ideal_answer = extract_section(
            output,
            "IDEAL ANSWER",
            []
        )

        ideal_answer = clean_text(
            ideal_answer
        )

        # ==================================================
        # I DON'T KNOW FEEDBACK
        # ==================================================

        if dont_know:

            strengths = [
                "You were honest instead of inventing an answer.",
                "You recognized that you needed more knowledge."
            ]

            weaknesses = [
                "You did not demonstrate technical knowledge for this question.",
                "You need to strengthen your understanding of this topic."
            ]

            improvement = (
                "Study the core concept behind this question, "
                "then practice explaining it in your own words "
                "with a simple example."
            )

        # ==================================================
        # SAFETY FALLBACKS
        # ==================================================

        if len(strengths) < 2:

            strengths = [
                "You attempted to communicate an answer.",
                "You participated in the interview."
            ]

        if len(weaknesses) < 2:

            weaknesses = [
                "Your answer could contain more detail.",
                "Your explanation could be more structured."
            ]

        if not improvement:

            improvement = (
                "Give a more structured answer and explain "
                "your reasoning with a relevant example."
            )

        if not ideal_answer:

            ideal_answer = (
                "I would answer the question directly and "
                "explain the relevant concept clearly. "
                "I would mention the main approach I would use "
                "and give a practical example where appropriate."
            )

        # ==================================================
        # OVERALL
        # ==================================================

        overall = round(
            (
                communication
                + technical
                + relevance
                + clarity
                + confidence
            ) / 5,
            1
        )

        # ==================================================
        # FINAL RESULT
        # ==================================================

        result = {

            "overall_score": overall,

            "communication": communication,

            "technical_knowledge": technical,

            "relevance": relevance,

            "clarity": clarity,

            "confidence": confidence,

            "strengths": strengths[:2],

            "weaknesses": weaknesses[:2],

            "improvement": improvement,

            "ideal_answer": ideal_answer
        }

        print("FINAL SCORES:")
        print("Communication:", communication)
        print("Technical:", technical)
        print("Relevance:", relevance)
        print("Clarity:", clarity)
        print("Confidence:", confidence)
        print("Overall:", overall)
        print()

        return jsonify(result)

    except Exception as error:

        print()
        print("==========================================")
        print("EVALUATION ERROR")
        print("==========================================")
        print(error)
        print()

        return jsonify({
            "error": str(error)
        }), 500


# ==========================================================
# START SERVER
# ==========================================================

if __name__ == "__main__":

    print()
    print("==========================================")
    print("       AI INTERVIEW COACH")
    print("==========================================")
    print("Backend running on:")
    print("http://127.0.0.1:5000")
    print()
    print("Ollama:")
    print(OLLAMA_URL)
    print()
    print("Model:", MODEL)
    print("==========================================")
    print()

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )