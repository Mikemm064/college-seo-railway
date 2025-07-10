import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import fetch
let fetch;
try {
    fetch = globalThis.fetch;
    if (!fetch) throw new Error('No native fetch');
} catch {
    const nodeFetch = await import('node-fetch');
    fetch = nodeFetch.default;
}

// Load environment
try {
    const dotenv = await import('dotenv');
    dotenv.config();
} catch {
    console.log('⚠️ dotenv not available');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// FIXED: Simplified static file serving
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));

// Validate environment
if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
    console.error('❌ Missing DataForSEO credentials');
    // Don't exit - continue with mock data
}

const DATAFORSEO_CONFIG = {
    baseUrl: 'https://api.dataforseo.com/v3',
    login: process.env.DATAFORSEO_LOGIN,
    password: process.env.DATAFORSEO_PASSWORD,
    timeout: 30000
};

// ADDED: Complete college sports keyword set (adapted from hockey version)
const COLLEGE_SPORTS_KEYWORDS = [
    // Ticket-related keywords (high revenue impact)
    '{team} tickets',
    '{team} {sport} tickets',
    'cheap {team} tickets',
    '{team} ticket deals',
    '{team} discount tickets',
    '{team} season tickets',
    '{team} student tickets',
    
    // Game day experience keywords
    '{team} parking',
    'where to park {team} game',
    '{team} parking tips',
    'best parking {team}',
    '{team} tailgating',
    '{team} game day guide',
    
    // Schedule and information
    '{team} schedule',
    '{team} {sport} schedule',
    '{team} game today',
    '{team} next game',
    
    // First-timer and fan experience
    'first time {team} game',
    'what to expect {team} game',
    'attending {team} game guide',
    '{team} stadium guide',
    
    // Local search terms
    'hotels near {team}',
    'restaurants near {team}',
    'things to do near {team}',
    
    // Family and group experiences
    '{team} family packages',
    '{team} group tickets',
    'kids activities {team}',
    '{team} birthday parties'
];

let lastApiCall = 0;
const MIN_DELAY_MS = 3000;

function generateKeywords(teamName, sport) {
    const cleanName = teamName.toLowerCase().trim().replace(/[^a-zA-Z0-9\s]/g, '');
    const cleanSport = sport.toLowerCase();
    
    return COLLEGE_SPORTS_KEYWORDS.map(pattern => 
        pattern.replace('{team}', cleanName).replace('{sport}', cleanSport)
    ).filter(keyword => keyword.length > 5);
}

function getBasicAuth() {
    return Buffer.from(`${DATAFORSEO_CONFIG.login}:${DATAFORSEO_CONFIG.password}`).toString('base64');
}

async function enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastCall = now - lastApiCall;
    
    if (timeSinceLastCall < MIN_DELAY_MS) {
        const waitTime = MIN_DELAY_MS - timeSinceLastCall;
        console.log(`⏱️ Rate limiting: waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    lastApiCall = Date.now();
}

async function callDataForSEOAPI(endpoint, data) {
    await enforceRateLimit();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DATAFORSEO_CONFIG.timeout);
    
    try {
        console.log(`📡 DataForSEO: ${endpoint}`);
        
        const response = await fetch(`${DATAFORSEO_CONFIG.baseUrl}${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${getBasicAuth()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        
        if (result.status_code === 20000) {
            console.log(`✅ API Success`);
            return result;
        } else {
            throw new Error(`DataForSEO Error ${result.status_code}`);
        }
    } catch (error) {
        clearTimeout(timeoutId);
        console.error(`❌ API Failed:`, error.message);
        return null;
    }
}

async function getSERPData(keyword) {
    if (!keyword?.trim()) return null;
    
    const data = [{
        keyword: keyword.trim(),
        location_code: 2840,
        language_code: "en",
        device: "desktop",
        depth: 100
    }];

    const result = await callDataForSEOAPI('/serp/google/organic/live/advanced', data);
    return result;
}

function analyzeGap(serpData, teamName, keyword, sport) {
    console.log(`🔍 Gap Analysis: "${keyword}"`);
    
    if (!serpData?.tasks?.[0]?.result?.[0]?.items) {
        console.log(`❌ No SERP data - using fallback`);
        return createFallbackGap(keyword, teamName, sport);
    }

    const items = serpData.tasks[0].result[0].items;
    let teamRank = null;
    let highestTeamRank = null;
    const competitors = [];
    const teamSites = [];
    
    items.forEach((item, index) => {
        const rank = index + 1;
        const domain = item.domain || 'unknown-domain';
        
        if (isTeamSite(domain, teamName)) {
            teamSites.push({ domain, rank, title: item.title });
            if (!highestTeamRank) highestTeamRank = rank;
        } else {
            if (rank <= 10) {
                competitors.push({
                    domain,
                    rank,
                    title: (item.title || 'No title').substring(0, 50)
                });
            }
        }
    });
    
    const gapAnalysis = analyzeActualGap(keyword, highestTeamRank, competitors, teamSites, sport);
    
    console.log(`📊 Gap Result: ${gapAnalysis.hasGap ? 'GAP FOUND' : 'NO SIGNIFICANT GAP'} (Team: ${highestTeamRank ? `#${highestTeamRank}` : 'Not found'})`);
    
    return gapAnalysis;
}

function analyzeActualGap(keyword, teamRank, competitors, teamSites, sport) {
    let hasGap = false;
    let gapReason = '';
    let opportunity = 3;
    
    if (!teamRank || teamRank > 5) {
        hasGap = true;
        gapReason = teamRank ? `Team ranks #${teamRank}, opportunity to reach top 5` : 'Team not found in top 10';
        opportunity += 3;
    }
    
    const ticketResellers = competitors.filter(c => 
        ['ticketmaster.com', 'stubhub.com', 'seatgeek.com', 'vivid-seats.com', 'vividseats.com'].includes(c.domain)
    );
    if (ticketResellers.length > 0 && (!teamRank || teamRank > ticketResellers[0].rank)) {
        hasGap = true;
        gapReason = `Ticket resellers (${ticketResellers.map(t => t.domain).join(', ')}) outranking official site`;
        opportunity += 3;
    }
    
    const ugcSites = competitors.filter(c => 
        ['reddit.com', 'facebook.com', 'youtube.com', 'tripadvisor.com', 'yelp.com'].includes(c.domain)
    );
    if (ugcSites.length > 0 && (!teamRank || teamRank > ugcSites[0].rank)) {
        hasGap = true;
        gapReason = `Fan content (${ugcSites[0].domain}) outranking official site`;
        opportunity += 1;
    }
    
    if (keyword.includes('first time') && (!teamRank || teamRank > 3)) {
        hasGap = true;
        gapReason = 'Missing first-timer content - high-value keyword';
        opportunity += 2;
    }
    
    if (keyword.includes('parking') && (!teamRank || teamRank > 3)) {
        hasGap = true;
        gapReason = 'Missing comprehensive parking information';
        opportunity += 1;
    }
    
    let rankingDisplay = 'Not Found';
    if (teamRank) {
        if (teamRank === 1) rankingDisplay = 'Excellent (#1)';
        else if (teamRank <= 3) rankingDisplay = 'Very Good (#2-3)';
        else if (teamRank <= 5) rankingDisplay = 'Good (#4-5)';
        else if (teamRank <= 10) rankingDisplay = 'Fair (#6-10)';
        else rankingDisplay = 'Poor (#11+)';
    }
    
    return {
        hasGap,
        gapReason,
        opportunity: Math.min(opportunity, 10),
        teamRank: rankingDisplay,
        actualRank: teamRank,
        competitors: competitors.slice(0, 5),
        teamSites,
        isRealData: true
    };
}

function isTeamSite(domain, teamName) {
    if (!domain || !teamName) return false;
    
    const cleanDomain = domain.toLowerCase().replace(/[^a-z]/g, '');
    const cleanTeamName = teamName.toLowerCase();
    const teamWords = cleanTeamName.split(' ').filter(word => word.length > 2);
    const concatenatedName = cleanTeamName.replace(/\s+/g, '');
    
    // Check for university domains
    if (domain.includes('.edu')) return true;
    
    const hasAllWords = teamWords.length >= 2 ? 
        teamWords.every(word => cleanDomain.includes(word)) : 
        teamWords.some(word => cleanDomain.includes(word));
    
    const hasConcatenated = cleanDomain.includes(concatenatedName);
    
    return hasAllWords || hasConcatenated;
}

function createFallbackGap(keyword, teamName, sport) {
    const hasGap = Math.random() > 0.7;
    const opportunity = hasGap ? 7 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 2);
    
    return {
        hasGap,
        gapReason: hasGap ? 'API data unavailable - potential opportunity based on keyword type' : 'No significant gap detected',
        opportunity,
        teamRank: Math.random() > 0.5 ? 'Not Found' : 'Fair (#6-10)',
        actualRank: null,
        competitors: getSimulatedCompetitors(keyword),
        teamSites: [],
        isRealData: false
    };
}

function getGapType(keyword, sport) {
    if (keyword.includes('ticket')) return 'Ticket Revenue Loss';
    if (keyword.includes('first time')) return 'First-Timer Experience Gap';
    if (keyword.includes('parking')) return 'Game Day Information Gap';
    if (keyword.includes('hotel') || keyword.includes('restaurant')) return 'Local Information Gap';
    if (keyword.includes('family')) return 'Family Content Gap';
    return `${sport.charAt(0).toUpperCase() + sport.slice(1)} Content Gap`;
}

function getContentSuggestion(keyword, sport) {
    if (keyword.includes('ticket')) {
        return {
            title: 'Official Ticket Center',
            format: 'Dedicated ticket sales page with schedule integration',
            cta: 'Buy Official Tickets'
        };
    }
    if (keyword.includes('first time')) {
        return {
            title: 'Complete First-Timer\'s Guide',
            format: 'Step-by-step game day experience guide',
            cta: 'Plan Your First Game'
        };
    }
    if (keyword.includes('parking')) {
        return {
            title: 'Ultimate Parking Guide',
            format: 'Interactive map with prices & tips',
            cta: 'Reserve Parking + Tickets'
        };
    }
    return {
        title: `${sport.charAt(0).toUpperCase() + sport.slice(1)} Fan Experience Guide`,
        format: 'Comprehensive information hub',
        cta: 'Plan Your Visit'
    };
}

function getLLMStrategy(keyword, sport) {
    if (keyword.includes('first time')) return `Create conversational FAQ content optimized for "what to expect at ${sport} games" voice searches`;
    if (keyword.includes('parking')) return 'Provide specific, actionable parking instructions with pricing and accessibility info';
    if (keyword.includes('family')) return 'Focus on family-friendly language and safety information for college sports';
    return `Use natural language that answers specific ${sport} fan questions and concerns`;
}

function estimateSearchVolume(keyword, sport) {
    const baseVolume = sport === 'football' ? 500 : sport === 'basketball' ? 300 : 200;
    if (keyword.includes('ticket')) return baseVolume + Math.floor(Math.random() * 600);
    if (keyword.includes('schedule')) return baseVolume + Math.floor(Math.random() * 400);
    if (keyword.includes('parking')) return Math.floor(Math.random() * 250) + 150;
    return Math.floor(Math.random() * 200) + 100;
}

function getSimulatedCompetitors(keyword) {
    if (keyword.includes('ticket')) {
        return [
            { domain: 'stubhub.com', rank: 1 },
            { domain: 'ticketmaster.com', rank: 2 },
            { domain: 'seatgeek.com', rank: 3 }
        ];
    }
    if (keyword.includes('parking')) {
        return [
            { domain: 'spothero.com', rank: 2 },
            { domain: 'parkwhiz.com', rank: 3 }
        ];
    }
    return [
        { domain: 'espn.com', rank: 1 },
        { domain: 'sports.yahoo.com', rank: 2 },
        { domain: 'cbssports.com', rank: 3 }
    ];
}

// Health check route
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK',
        dataforseo: {
            configured: !!(DATAFORSEO_CONFIG.login && DATAFORSEO_CONFIG.password)
        }
    });
});

// FIXED: Complete analysis route
app.post('/api/analyze', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { teamName, sport, email } = req.body;
        
        if (!teamName?.trim() || !sport?.trim() || !email?.trim()) {
            return res.status(400).json({ 
                success: false,
                error: 'Team name, sport, and email are required' 
            });
        }

        const cleanTeamName = teamName.trim().substring(0, 50);
        console.log(`\n🏈 GAP ANALYSIS: "${cleanTeamName}" (${sport})`);
        
        const keywords = generateKeywords(cleanTeamName, sport);
        console.log(`📝 Analyzing ${keywords.length} keywords for gaps`);
        
        let gapAnalyses = [];
        let realDataCount = 0;
        
        const keywordsToAnalyze = keywords.slice(0, 8);
        
        for (const keyword of keywordsToAnalyze) {
            console.log(`\n🔍 "${keyword}"`);
            
            try {
                const serpData = await getSERPData(keyword);
                const gapAnalysis = analyzeGap(serpData, cleanTeamName, keyword, sport);
                
                if (serpData) realDataCount++;
                
                if (gapAnalysis.hasGap) {
                    gapAnalyses.push({
                        keyword,
                        opportunity: gapAnalysis.opportunity,
                        gapType: getGapType(keyword, sport),
                        teamRank: gapAnalysis.teamRank,
                        competitors: gapAnalysis.competitors,
                        contentSuggestion: getContentSuggestion(keyword, sport),
                        llmStrategy: getLLMStrategy(keyword, sport),
                        searchVolume: estimateSearchVolume(keyword, sport),
                        isRealData: gapAnalysis.isRealData,
                        gapReason: gapAnalysis.gapReason,
                        revenueImpact: keyword.includes('ticket') ? 'High: Direct ticket sales opportunity' : 'Medium: Brand and engagement opportunity'
                    });
                    console.log(`✅ GAP FOUND: ${gapAnalysis.gapReason}`);
                } else {
                    console.log(`⚪ No gap: Team performing well`);
                }
                
            } catch (error) {
                console.error(`❌ Error: ${keyword}:`, error.message);
            }
        }
        
        if (gapAnalyses.length === 0) {
            const remainingKeywords = keywords.slice(8, 12);
            for (const keyword of remainingKeywords) {
                if (gapAnalyses.length >= 3) break;
                
                const fallbackGap = createFallbackGap(keyword, cleanTeamName, sport);
                if (fallbackGap.hasGap && fallbackGap.opportunity >= 8) {
                    gapAnalyses.push({
                        keyword,
                        opportunity: fallbackGap.opportunity,
                        gapType: getGapType(keyword, sport),
                        teamRank: fallbackGap.teamRank,
                        competitors: fallbackGap.competitors,
                        contentSuggestion: getContentSuggestion(keyword, sport),
                        llmStrategy: getLLMStrategy(keyword, sport),
                        searchVolume: estimateSearchVolume(keyword, sport),
                        isRealData: false,
                        gapReason: fallbackGap.gapReason,
                        revenueImpact: 'Medium: Brand and engagement opportunity'
                    });
                }
            }
        }
        
        gapAnalyses.sort((a, b) => b.opportunity - a.opportunity);
        
        const processingTime = Date.now() - startTime;
        
        console.log(`\n🎯 GAPS FOUND: ${gapAnalyses.length} actionable opportunities`);
        console.log(`📊 Real data: ${realDataCount}/${keywordsToAnalyze.length}`);
        
        if (gapAnalyses.length === 0) {
            console.log(`✅ EXCELLENT: Team performing well on all analyzed keywords!`);
        }
        
        res.json({
            success: true,
            teamName: cleanTeamName,
            sport,
            totalKeywords: keywords.length,
            analyses: gapAnalyses,
            summary: {
                highOpportunity: gapAnalyses.filter(a => a.opportunity >= 7).length,
                totalSearchVolume: gapAnalyses.reduce((sum, a) => sum + a.searchVolume, 0),
                topGapTypes: [...new Set(gapAnalyses.map(a => a.gapType))],
                realDataPoints: realDataCount
            },
            meta: {
                processingTimeMs: processingTime,
                dataQuality: realDataCount > 0 ? 'Live Gap Analysis' : 'Simulated Gap Analysis',
                keywordsAnalyzed: keywordsToAnalyze.length,
                gapsFound: gapAnalyses.length
            }
        });
        
    } catch (error) {
        console.error('❌ Analysis error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Analysis failed'
        });
    }
});

// Root route
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(`
            <h1>College Sports SEO Gap Analyzer</h1>
            <p>Frontend not found. Place index.html in public/ directory.</p>
        `);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏈 College Sports SEO Gap Analyzer`);
    console.log(`🎯 Analyzing ticket reseller competition and student engagement gaps`);
    console.log(`🚀 Running on port ${PORT}`);
    console.log(`🌐 Ready for Railway deployment!`);
});
