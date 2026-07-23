import { fetchRightmoveListing } from '../../server/listingExtractor.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const listing = await fetchRightmoveListing(req.body?.url);
    return res.status(200).json(listing);
  } catch (error) {
    const status = Number.isInteger(error?.status) ? error.status : 500;
    return res.status(status).json({ error: error instanceof Error ? error.message : 'Unable to extract listing.' });
  }
}
