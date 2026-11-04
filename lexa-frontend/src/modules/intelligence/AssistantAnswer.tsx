import type { ReactNode } from 'react';

/** Safe formatting: React escapes all model text. We never render HTML from providers. */
function boldText(input: string): ReactNode[] {
  return input.split(/(\*\*[^*]+\*\*)/g).map((part,i)=>part.startsWith('**') && part.endsWith('**')
    ? <strong key={i}>{part.slice(2,-2)}</strong> : part);
}
export default function AssistantAnswer({ text }: { text: string }) {
  const rows=text.replace(/\r\n/g,'\n').split('\n').slice(0,120);
  return <div className="lexa-assistant-answer">{rows.map((row,i)=>{
    const line=row.trim();
    if(!line) return <div className="lexa-answer-space" key={i} aria-hidden="true"/>;
    if(/^#{1,3}\s/.test(line)) return <h3 key={i}>{boldText(line.replace(/^#{1,3}\s+/,''))}</h3>;
    if(/^[-•]\s/.test(line)) return <p key={i} className="lexa-answer-bullet"><span aria-hidden="true">•</span>{boldText(line.replace(/^[-•]\s+/,''))}</p>;
    if(/^\d+[.)]\s/.test(line)) return <p key={i} className="lexa-answer-number">{boldText(line)}</p>;
    return <p key={i}>{boldText(line)}</p>;
  })}</div>;
}
