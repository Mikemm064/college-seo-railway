import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.send(`
        <h1>✅ WORKING!</h1>
        <p>Server is running on port ${PORT}</p>
        <p>Time: ${new Date()}</p>
    `);
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', port: PORT });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on ${PORT}`);
});
