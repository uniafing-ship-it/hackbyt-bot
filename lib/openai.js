export async function generateText(instruction) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-5.6-luna',
      input: instruction,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'OpenAI API error');

  const text = data.output_text;
  if (!text) throw new Error('OpenAI returned an empty response');
  return text.trim();
}
