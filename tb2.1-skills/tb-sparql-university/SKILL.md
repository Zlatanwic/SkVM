---
name: tb-sparql-university
description: Write a SPARQL query against an RDF knowledge graph to find full professors in EU university departments with more than 10 enrolled students. Use this skill when the task mentions SPARQL, RDF, Turtle (.ttl) files, querying university data, filtering by EU country codes, full professor criteria, department enrollment thresholds, or saving a query to `/app/solution.sparql`. Also trigger when the user references `university_graph.ttl`, ISO 3166-1 alpha-2 country codes, GROUP_CONCAT aggregation, or date-based filtering with `2025-08-16`.
---

# tb-sparql-university

Write a SPARQL query that retrieves full professors working in at least one EU
university department with more than 10 enrolled students, returning professor
names and the countries they work in. This is a Terminal-Bench 2.1 task; the
full task lives at `tasks/sparql-university/` in the same repo.

## When this skill triggers

Use it when the user is dropped into the `sparql-university` Docker container
and needs to write a SPARQL query saved as `/app/solution.sparql`. Do **not**
use it for general SPARQL tutorials, SQL queries, or non-RDF data querying.

## Goal (one sentence)

Write a single SPARQL query saved to `/app/solution.sparql` that returns all
full professors meeting the three criteria: full professor rank, works in an EU
country university department, and has a department with >10 enrolled students.

## Required outputs

| File | Purpose |
|---|---|
| `/app/solution.sparql` | A valid SPARQL query that, when executed against `university_graph.ttl`, returns professor names and a comma-separated list of countries. |

The query must use this exact SELECT clause:
```sparql
SELECT ?professorName (GROUP_CONCAT(DISTINCT ?country; separator=", ") AS ?countries)
```

## Recommended workflow

### 1. Explore the ontology (≈ 10 min)

- Open `/app/university_graph.ttl`. This Turtle file contains both the ontology
  (class and property definitions) and the instance data.
- Identify key classes: `ex:University`, `ex:Department`, `ex:Employee`,
  `ex:Professor`, `ex:Student`, `ex:Class`, etc.
- Identify key properties: `ex:worksIn`, `ex:locatedIn`, `ex:hasRank`,
  `ex:enrolledIn`, `ex:teachesIn`, `ex:name`, `ex:country`, etc.
- Note the date-related properties: enrollments and employments may have
  start/end dates that need to be checked against the reference date
  `2025-08-16`.

### 2. Map EU country codes (≈ 3 min)

- The task uses ISO 3166-1 alpha-2 two-letter codes (e.g., "GR" for Greece,
  "DE" for Germany, "FR" for France).
- EU member states as of 2025-08-16 (27 countries): AT, BE, BG, HR, CY, CZ, DK,
  EE, FI, FR, DE, GR, HU, IE, IT, LV, LT, LU, MT, NL, PL, PT, RO, SK, SI, ES, SE.
- Use `VALUES ?euCountry { "AT" "BE" "BG" ... }` in your SPARQL query to filter
  by EU membership.

### 3. Build the query step by step (≈ 20 min)

Each criterion maps to SPARQL triple patterns:

**Criterion 1: Full professors.**
```sparql
?professor a ex:Professor ;
          ex:hasRank ex:FullProfessor .
```

**Criterion 2: Works in an EU university department.**
```sparql
?professor ex:worksIn ?department .
?department ex:partOf ?university .
?university ex:locatedIn ?country .
FILTER(?country IN ("AT", "BE", ...))
```
Also check date constraints: the employment must be current as of `2025-08-16`
(i.e., start date <= reference date, and end date is either absent or > reference date).

**Criterion 3: Department with >10 enrolled students.**
```sparql
?class ex:taughtIn ?department .
?student ex:enrolledIn ?class .
```
Count students per department; filter to departments where `COUNT(DISTINCT ?student) > 10`.
Again, check enrollment dates against the reference date.

**Output**: `GROUP_CONCAT(DISTINCT ?country; separator=", ")` grouped by professor name.

### 4. Handle date logic correctly (≈ 5 min)

- All temporal properties (employment start/end, enrollment start/end) must be
  compared against `"2025-08-16"^^xsd:date`.
- Active employment: `?startDate <= "2025-08-16"^^xsd:date` AND
  `(!BOUND(?endDate) || ?endDate > "2025-08-16"^^xsd:date)`.
- Active enrollment: same pattern.
- Use the predicate/property names as defined in the ontology in `university_graph.ttl`.

### 5. Test the query (≈ 10 min)

- Use a local SPARQL engine (e.g., `arq`, `rdflib`, or the container's built-in
  tools) to execute the query against `university_graph.ttl`.
- Verify results are non-empty and make sense.
- If the container has no SPARQL endpoint, try:
  ```bash
  python3 -c "
  from rdflib import Graph
  g = Graph()
  g.parse('/app/university_graph.ttl', format='turtle')
  results = g.query(open('/app/solution.sparql').read())
  for row in results:
      print(row)
  "
  ```

## Verifier checklist (must all pass)

- [ ] `/app/solution.sparql` exists and is syntactically valid SPARQL.
- [ ] Query returns `?professorName` and `?countries` with the exact SELECT form.
- [ ] Only full professors are returned (not associate/assistant).
- [ ] All returned professors work in at least one EU-country university.
- [ ] The EU country filter uses the correct 27 member states.
- [ ] Each professor has at least one department with >10 currently enrolled students.
- [ ] Date logic uses `2025-08-16` as the reference date.
- [ ] Countries are comma-separated without duplicates per professor.

## Common pitfalls

1. **Wrong EU country list.** Using an outdated or incomplete set of EU country
   codes is the most common failure. As of 2025-08-16, there are 27 EU member
   states. Do not include non-EU European countries (UK, NO, CH) or candidate
   countries.
2. **Missing date constraints.** Without checking `startDate`/`endDate` against
   the reference date, you may include professors who no longer work at the
   university or students whose enrollment has ended. Always filter for active
   status as of `2025-08-16`.
3. **Incorrect aggregation scope.** `GROUP_CONCAT` must be grouped by
   `?professorName`. If you group by department or include extra variables,
   you may get duplicate rows or incorrectly split country lists.
4. **COUNT in the wrong scope.** The >10 student constraint is a subquery or
   `HAVING` condition on `COUNT` within a department group. If you count
   globally or per-professor instead of per-department, the numbers will be wrong.
5. **Syntax mismatch with the engine.** SPARQL 1.1 features like `GROUP_CONCAT`,
   `VALUES`, and subqueries may behave differently across engines. Test against
   the actual graph file.

## Reference pointers

- The Turtle file at `/app/university_graph.ttl` is the sole data source.
  Explore it first to understand property and class URIs.
- SPARQL 1.1 specification for `GROUP_CONCAT`, `HAVING`, subqueries (`SELECT`
  inside `WHERE`), and `VALUES`.
- ISO 3166-1 alpha-2 codes for the 27 EU member states.
- Reference date: `"2025-08-16"^^xsd:date`.
