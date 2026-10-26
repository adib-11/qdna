---
status: accepted
---

# A corpus is exactly one course

Parent spec #1 aimed qDNA at a whole semester, and a five-course bundle shipped as a sample. We dropped that. Students revise one exam at a time, from past papers of one course. Ranking a Math topic against an EEE topic answers no question a student has, and a mixed corpus showed every topic as "1 of 7 papers".

A course can be taught in more than one department, under different codes and slightly different names. Students do want those papers too, because the same professor often reuses questions across departments. So a corpus holds papers from one or more offerings of one course. Papers from two offerings join one corpus only when they share a printed code or the student says they are the same course. We considered matching on course title or on topic similarity, and rejected both: titles vary in wording and get misread by extraction, and similarity would sometimes merge unrelated courses.

## Consequences

- When several courses arrive together, through an upload, a corpus file import or an older saved corpus, they are split into one corpus per course instead of being refused, so no extraction requests are wasted.
- Topic grouping treats every label in a corpus as belonging to one course, so topics fold across offerings.
- The whole-semester sample is removed. A "cross-department" lineage now means one that spans more than one offering.
