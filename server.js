import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import fetch with error handling
let fetch;
try {
    fetch = globalThis.fetch;
    if (!fetch) throw new Error('No native fetch');
} catch {
    try {
        const nodeFetch = await import('node-fetch');
        fetch = nodeFetch.default;
    } catch (error) {
        console.error('Failed to load fetch:', error);
        fetch = null;
    }
}

// Load environment with error handling
try {
    const dotenv = await import('dotenv');
    dotenv.config();
} catch {
    console.log('⚠️ dotenv not available - using environment variables directly');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Create public directory
const publicDir = path.join(__dirname, 'public');
try {
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
    }
    app.use(express.static(publicDir));
} catch (error) {
    console.error('Failed to set up static files:', error);
}

// Check credentials with better error handling
let credentialsAvailable = false;
try {
    if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
        console.warn('⚠️ DataForSEO credentials missing - API features will be limited');
        credentialsAvailable = false;
    } else {
        console.log('✅ DataForSEO credentials loaded successfully');
        credentialsAvailable = true;
    }
} catch (error) {
    console.error('Error checking credentials:', error);
    credentialsAvailable = false;
}

const DATAFORSEO_CONFIG = {
    baseUrl: 'https://api.dataforseo.com/v3',
    login: process.env.DATAFORSEO_LOGIN || 'demo-login',
    password: process.env.DATAFORSEO_PASSWORD || 'demo-password',
    timeout: 30000,
    useAiOptimized: process.env.USE_AI_OPTIMIZED !== 'false',
    aiOptimizedSuffix: '.ai',
    credentialsAvailable
};

// CRITICAL: Health check route FIRST (before other routes)
app.get('/api/health', (req, res) => {
    try {
        res.json({ 
            status: 'OK',
            timestamp: new Date().toISOString(),
            dataforseo: {
                configured: credentialsAvailable,
                aiOptimized: DATAFORSEO_CONFIG.useAiOptimized
            },
            server: {
                port: PORT,
                environment: process.env.NODE_ENV || 'development'
            }
        });
    } catch (error) {
        console.error('Health check error:', error);
        res.status(500).json({ 
            status: 'ERROR',
            error: 'Health check failed'
        });
    }
});

// CRITICAL: Root route with robust error handling
app.get('/', (req, res) => {
    try {
        const indexPath = path.join(__dirname, 'public', 'index.html');
        
        if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
        } else {
            // Fallback HTML if index.html missing
            res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>College Sports SEO Gap Analyzer</title>
                    <style>
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
                            background: #1a1a1a; 
                            color: #fff; 
                            padding: 40px; 
                            text-align: center;
                            margin: 0;
                        }
                        .status { background: #0a5a0a; padding: 20px; border-radius: 8px; margin: 20px 0; }
                        .warning { background: #5a5a0a; padding: 20px; border-radius: 8px; margin: 20px 0; }
                        a { color: #00aaff; text-decoration: none; }
                        a:hover { text-decoration: underline; }
                    </style>
                </head>
                <body>
                    <h1>🏈 College Sports SEO Gap Analyzer</h1>
                    <div class="status">
                        <h2>✅ Server Running Successfully</h2>
                        <p>Port: ${PORT} | Environment: ${process.env.NODE_ENV || 'development'}</p>
                    </div>
                    
                    <div class="warning">
                        <h3>⚠️ Frontend Missing</h3>
                        <p>index.html not found in public/ directory</p>
                        <p>DataForSEO: ${credentialsAvailable ? '✅ Configured' : '❌ Missing'}</p>
                    </div>
                    
                    <div class="status">
                        <h3>🧪 API Testing</h3>
                        <p><a href="/api/health">Health Check</a> | Test server status</p>
                    </div>
                </body>
                </html>
            `);
        }
    } catch (error) {
        console.error('Root route error:', error);
        res.status(500).send('Server Error');
    }
});

// Error handling for all routes
app.use((error, req, res, next) => {
    console.error('Express error:', error);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        error: 'Route not found' 
    });
});

// CRITICAL: Proper server startup with error handling
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏈 College Sports SEO Gap Analyzer`);
    console.log(`🎯 Analyzing ticket reseller competition and fan experience gaps`);
    console.log(`🔑 DataForSEO credentials: ${credentialsAvailable ? '✅ CONFIGURED' : '⚠️ MISSING'}`);
    console.log(`🤖 AI-optimized DataForSEO: ${DATAFORSEO_CONFIG.useAiOptimized ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🚀 Running on port ${PORT} (bound to 0.0.0.0)`);
    console.log(`🌐 Ready for Railway deployment!`);
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
        process.exit(1);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
    });
});
