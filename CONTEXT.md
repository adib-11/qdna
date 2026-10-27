# qDNA

qDNA turns a student's past exam papers into a ranked, auditable answer to "what do I study first". Every number it shows is counted from the papers the student supplied.

## Corpus

**Course**:
The subject a student is studying. The same course can be taught in more than one department, under different codes and slightly different names.
_Avoid_: Subject, class

**Offering**:
One department's version of a course, identified by the course code(s) printed on its papers.
_Avoid_: Department course, section

**Corpus**:
The set of papers one student analyses together: past papers of exactly one course, from one or more offerings, usually from several years. Papers from two offerings join one corpus only when they share a printed code or the student says they are the same course.
_Avoid_: Upload, dataset, session, semester

**Paper**:
One sitting of an exam, a class test or a final, identified by its printed label.
_Avoid_: PDF, document, file

**Question**:
One numbered, markable item on a paper, such as "2(b)", with its text and marks.
_Avoid_: Item, problem

## Topics

**Topic**:
The subject a question examines, as named after topic grouping.
_Avoid_: Category, tag, chapter

**Topic label**:
The raw subject name the extractor attached to one question before grouping.
_Avoid_: Topic (when the raw label is meant)

**Topic grouping**:
The corpus-wide step that folds topic labels naming the same subject into one topic.
_Avoid_: Clustering, dedup, normalisation

**Topic override**:
A student's own merge or rename of topics. It takes precedence over topic grouping.
_Avoid_: Manual edit, correction

## Evidence

**Lineage**:
A set of questions from two or more papers that are the same question asked again, possibly with changed numbers or wording. Similar sub-parts of one paper are not a lineage.
_Avoid_: Cluster, duplicate group

**Variant**:
One member of a lineage.
_Avoid_: Duplicate, copy

**Backtest**:
A check that hides one paper, ranks topics from the remaining papers, and measures how much of the hidden paper those topics covered.
_Avoid_: Validation, accuracy test

**Held-out paper**:
The paper a backtest hides.
_Avoid_: Test paper, target paper

**Holdout coverage**:
The share of a held-out paper's questions whose topic the backtest ranking named.
_Avoid_: Accuracy, hit rate

## Study output

**Study plan**:
The short, ordered list of topics a student should study first, with the marks they carry.
_Avoid_: Prediction, recommendation

**Practice paper**:
A generated paper with the measured shape of the corpus's papers, written on its top topics. It is a revision aid and never a forecast.
_Avoid_: Predicted paper, prediction, mock leak

**Hint**:
The approach and governing principle for one question, without its final answer.
_Avoid_: Solution, answer, tutor response

**How we know**:
The part of the results that shows the evidence behind the study plan: the genome map, Pareto coverage and the backtest.
_Avoid_: Advanced, details, analytics

## Sharing

**Corpus file**:
A portable copy of a corpus's extracted questions and topic overrides that another student can import without spending any requests.
_Avoid_: Backup, save file, share file

**Study pack**:
A Markdown export of the study plan and its evidence, written to be pasted into a general-purpose chatbot.
_Avoid_: LLM export, prompt, report

**Print view**:
The printable layout of the results, used to save them as a PDF.
_Avoid_: PDF export, report

## Measurement

**Ground truth**:
A hand-checked record of every question on a paper, with its number, marks, text and canonical topic.
_Avoid_: Gold set, labels

**Own key**:
A student's personal Gemini API key, held in their browser. It is the only key qDNA ever uses to call a model; there is no shared quota.
_Avoid_: BYOK, custom key
