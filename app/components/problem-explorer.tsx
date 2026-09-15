"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Filter, Search, SlidersHorizontal } from "lucide-react";
import { challenges, type Difficulty, type Domain } from "../../lib/challenges";

const difficulties: Array<Difficulty | "All"> = ["All", "Foundation", "Intermediate", "Advanced", "Expert"];
const domains: Array<Domain | "All"> = ["All", "DC", "AC", "Semiconductors", "Op-amps", "Digital"];

export function ProblemExplorer() {
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty | "All">("All");
  const [domain, setDomain] = useState<Domain | "All">("All");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return challenges.filter((challenge) => {
      const matchesSearch = !needle || `${challenge.title} ${challenge.summary} ${challenge.topics.join(" ")}`.toLowerCase().includes(needle);
      return matchesSearch && (difficulty === "All" || challenge.difficulty === difficulty) && (domain === "All" || challenge.domain === domain);
    });
  }, [query, difficulty, domain]);

  return (
    <div className="catalog-layout">
      <aside className="filter-panel" aria-label="Problem filters">
        <div className="filter-heading"><Filter size={17} /> Filters</div>
        <fieldset>
          <legend>Difficulty</legend>
          {difficulties.map((item) => (
            <label key={item}>
              <input type="radio" name="difficulty" checked={difficulty === item} onChange={() => setDifficulty(item)} />
              <span>{item}</span>
              <small>{item === "All" ? challenges.length : challenges.filter((problem) => problem.difficulty === item).length}</small>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Domain</legend>
          {domains.map((item) => (
            <label key={item}>
              <input type="radio" name="domain" checked={domain === item} onChange={() => setDomain(item)} />
              <span>{item}</span>
            </label>
          ))}
        </fieldset>
        <button className="clear-filters" type="button" onClick={() => { setDifficulty("All"); setDomain("All"); setQuery(""); }}>Clear filters</button>
      </aside>

      <div className="catalog-main">
        <div className="catalog-toolbar">
          <label className="search-box">
            <Search size={18} />
            <span className="sr-only">Search problems</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, topics, or skills…" />
          </label>
          <span className="result-count"><SlidersHorizontal size={16} /> {filtered.length} problems</span>
        </div>

        <div className="catalog-table" role="table" aria-label="Analog electronics problems">
          <div className="catalog-header" role="row">
            <span>Status</span><span>Problem</span><span>Difficulty</span><span>Domain</span><span>Public data</span><span />
          </div>
          {filtered.map((challenge) => (
            <Link className="catalog-row" href={`/problems/${challenge.slug}`} key={challenge.slug} role="row">
              <span className="catalog-status" aria-label={challenge.judge ? "Fixed-topology server judge available" : "Practice simulation available"}>
                {challenge.judge ? <span className="ranked-dot" /> : <CheckCircle2 size={17} />}
              </span>
              <span className="catalog-problem">
                <strong><i>{String(challenge.id).padStart(2, "0")}</i>{challenge.title}</strong>
                <small>{challenge.summary}</small>
                <span className="topic-row">{challenge.topics.slice(0, 3).map((topic) => <em key={topic}>{topic}</em>)}</span>
              </span>
              <span><i className={`difficulty difficulty-${challenge.difficulty.toLowerCase()}`}>{challenge.difficulty}</i></span>
              <span className="domain-cell">{challenge.domain}</span>
              <span className="acceptance-cell">
                {challenge.acceptance !== null && challenge.attempts > 0
                  ? <><b>{challenge.acceptance}%</b><small>{challenge.attempts.toLocaleString()} runs</small></>
                  : <><b>New</b><small>No public runs</small></>}
              </span>
              <span><ChevronRight size={18} /></span>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="empty-state"><Search size={26} /><h3>No matching problems</h3><p>Try a broader search or clear one of the filters.</p></div>
        )}
      </div>
    </div>
  );
}
