import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>College Sports SEO</title></head>
        <body style="font-family: Arial; padding: 40px; background: #1a1a1a; color: white;">
            <h1>✅ SUCCESS!</h1>
            <p>Server is WORKING on Railway</p>
            <p>Port: ${PORT}</p>
            <p>Time: ${new Date()}</p>
            <p>Variables available: ${Object.keys(process.env).length}</p>
        </body>
        </html>
    `);
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        port: PORT,
        variables: Object.keys(process.env).length
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on ${PORT}`);
});
