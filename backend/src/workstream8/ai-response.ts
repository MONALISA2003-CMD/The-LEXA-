/** Business-only response boundary; never executes tools or trusts model-supplied instructions. */
export type BusinessScope = 'overview' | 'sales' | 'inventory' | 'finance' | 'customers' | 'people';
const headings: Record<BusinessScope,string> = {
  overview:'Business overview', sales:'Sales overview', inventory:'Inventory overview',
  finance:'Financial overview', customers:'Customer overview', people:'Team overview',
};

/** Trivial requests are answered locally: no provider call, rate limit, or billing reservation. */
export function businessPreflight(question: string): string | null {
  const q=question.trim().toLowerCase().replace(/[!?.,]+$/g,'');
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|hello lexa|hi lexa|start|help)$/.test(q))
    return '## How can I help your business?\nI can review your sales, inventory, purchasing and financial figures, and help prepare business tasks. Choose a business area or tell me what you need.';
  // This is a UX gate; security must remain enforced by authenticated APIs and reviewed, typed action endpoints.
  if (/\b(ignore (all |the |your )?(previous|system|developer) instructions?|reveal (the |your )?(system prompt|api key|secret)|disable (security|access controls)|bypass (authentication|permissions)|you are now (a|an))\b/i.test(question))
    return '## Business requests only\nI can help with your LEXA business records and approved operations. Please ask about the work you need to complete.';
  if (/\b(tell me a joke|write a (poem|love letter)|dating advice|movie recommendations|political opinions|personal horoscope)\b/i.test(question))
    return '## Business requests only\nPlease ask about sales, stock, purchasing, finance, projects or another LEXA business operation.';
  return null;
}

/** Convert providers' occasional JSON or fenced Markdown into safe, readable text (never HTML). */
export function professionalAnswer(raw: string, scope: BusinessScope): string {
  let answer=raw.trim().slice(0,8_000);
  const fenced=/^```(?:json|markdown|md)?\s*([\s\S]*?)\s*```$/i.exec(answer);
  if (fenced?.[1]) answer=fenced[1].trim();
  if (answer.startsWith('{') && answer.endsWith('}')) {
    try {
      const data=JSON.parse(answer) as Record<string,unknown>;
      const candidate=data.answer ?? data.summary ?? data.response ?? data.message;
      if (typeof candidate==='string') answer=candidate.trim();
      else if (Array.isArray(data.points) && data.points.every(x=>typeof x==='string')) answer=(data.points as string[]).map(x=>'- '+x).join('\n');
      else answer='The requested analysis could not be presented. Please ask your business question again.';
    } catch { answer='The analysis could not be presented. Please try another business question.'; }
  }
  // Deliberately reject raw structured dumps; never display an object as an answer.
  if (/^\s*[\[{][\s\S]*[\]}]\s*$/.test(answer)) answer='The analysis could not be presented. Please try another business question.';
  answer=answer.replace(/\r\n/g,'\n').replace(/\n{3,}/g,'\n\n');
  if (!answer) return `## ${headings[scope]}\nNo verified information is available for this request.`;
  if (!/^#{1,3}\s/m.test(answer)) answer=`## ${headings[scope]}\n${answer}`;
  return answer;
}
