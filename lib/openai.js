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

export async function generateImage(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
      prompt,
      size: process.env.OPENAI_IMAGE_SIZE || '1024x1536',
      quality: process.env.OPENAI_IMAGE_QUALITY || 'high',
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'OpenAI image API error');

  const image = data?.data?.[0];
  if (!image?.b64_json) throw new Error('OpenAI returned no image data');

  return Buffer.from(image.b64_json, 'base64');
}
