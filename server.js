const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const { interpretWithClaude } = require('./sms-handler');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

app.get('/test', (req, res) => {
  res.json({ message: 'SaveBot backend is running!' });
});

app.get('/saves', async (req, res) => {
  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error });
  res.json(data);
});

app.post('/saves', async (req, res) => {
  const { title, category, description } = req.body;
  const { data, error } = await supabase
    .from('saves')
    .insert([{ title, category, description, source: 'manual' }])
    .select();
  if (error) return res.status(500).json({ error });
  res.json(data[0]);
});

app.post('/sms/webhook', async (req, res) => {
  const message = req.body.Body;
  const from = req.body.From;
  console.log(`SMS from ${from}: ${message}`);

  const interpreted = await interpretWithClaude(message);
  console.log('Claude interpreted:', interpreted);

  const { data, error } = await supabase
    .from('saves')
    .insert([{
      title: interpreted.title || message,
      category: interpreted.category || 'idea',
      description: interpreted.description || '',
      action: interpreted.action || '',
      why: interpreted.why || '',
      source: 'sms',
      from_number: from
    }])
    .select();

  if (error) console.error('Supabase error:', error);

  res.set('Content-Type', 'text/xml');
  res.send('<Response><Message>Saved! ✅</Message></Response>');
});

const PORT = process.env.PORT;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});