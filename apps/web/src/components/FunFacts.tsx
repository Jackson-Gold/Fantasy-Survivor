import { useState, useEffect } from 'react';

const SURVIVOR_FACTS = [
  'The very first US episode of Survivor premiered on May 31, 2000 on CBS.',
  "The Survivor: Borneo finale pulled an average of about 51.7 million viewers, which is still the franchise's peak.",
  'The original winner, Richard Hatch, won the title "Sole Survivor" and the $1 million grand prize in season 1.',
  'Jeff Probst has hosted the US version since the show began.',
  'Probst is a four-time Emmy winner for Outstanding Reality Host (he won the award multiple years in a row after the category launched).',
  "The show has basically \"set up camp\" in Fiji's Mamanuca Islands, using it as a semi-permanent home since season 33.",
  'The "new era" switched from the classic 39-day game to 26 days starting with Survivor 41, largely because of COVID-era production constraints.',
  'The biggest prize in US Survivor history was $2 million for Winners at War (season 40).',
  'Season 50 is a big milestone: CBS scheduled a three-hour premiere on Feb. 25, 2026 (8–11 PM ET).',
  "Survivor's format was not originally American. It was inspired by the international \"Robinson\" format.",
];

const ROTATE_MS = 6000;

export default function FunFacts() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % SURVIVOR_FACTS.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card-tribal p-4 border-l-4 border-ember-500 bg-gradient-to-r from-sand-50 to-amber-50/50">
      <p className="text-xs font-semibold uppercase tracking-wider text-ember-700 mb-1">Did you know?</p>
      <p className="text-ocean-900 text-sm leading-relaxed">{SURVIVOR_FACTS[index]}</p>
      <div className="flex gap-1 mt-2">
        {SURVIVOR_FACTS.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Fact ${i + 1}`}
            onClick={() => setIndex(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === index ? 'w-4 bg-ember-500' : 'w-1.5 bg-sand-300 hover:bg-ember-400'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
