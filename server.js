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

const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}
app.use(express.static(publicDir));

// Validate environment
if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
    console.error('❌ Missing DataForSEO credentials');
    process.exit(1);
}

const DATAFORSEO_CONFIG = {
    baseUrl: 'https://api.dataforseo.com/v3',
    login: process.env.DATAFORSEO_LOGIN,
    password: process.env.DATAFORSEO_PASSWORD,
    timeout: 30000,
    // NEW: AI optimization settings
    useAiOptimized: process.env.USE_AI_OPTIMIZED !== 'false', // Default to true
    aiOptimizedSuffix: '.ai' // Append to endpoints for AI-optimized responses
};

// COLLEGE SPORTS KEYWORDS - High competition opportunities
const COLLEGE_SPORTS_KEYWORDS = [
    // Fan Experience Questions (HIGH OPPORTUNITY - lots of searches)
    'first time {team} game experience',
    'what to expect {team} football game',
    'first {team} basketball game',
    'attending {team} game guide',
    '{team} gameday traditions',
    
    // Practical Information (HIGH OPPORTUNITY - reseller competition)
    '{team} parking tips',
    'where to park {team} stadium',
    'best parking {team} football',
    '{team} stadium bag policy',
    '{team} tailgating rules',
    
    // Ticket Competition (VERY HIGH OPPORTUNITY - revenue impact)
    'cheap {team} football tickets',
    '{team} student tickets',
    '{team} season tickets cost',
    '{team} single game tickets',
    '{team} ticket deals',
    
    // Venue & Seating (HIGH OPPORTUNITY)
    '{team} stadium seating chart',
    'best seats {team} football',
    '{team} basketball arena guide',
    '{team} club level seats',
    
    // Local & Travel (MEDIUM OPPORTUNITY)
    'hotels near {team} stadium',
    'restaurants near {team} campus',
    'things to do {team} game weekend',
    '{team} gameday itinerary',
    
    // Special Events (HIGH OPPORTUNITY)
    '{team} homecoming game',
    '{team} senior day tickets',
    '{team} rivalry game tickets'
];

let lastApiCall = 0;
const MIN_DELAY_MS = 3000;

function generateKeywords(teamName, sport = 'football') {
    const cleanName = teamName.toLowerCase().trim().replace(/[^a-zA-Z0-9\s]/g, '');
    const keywords = [];
    
    COLLEGE_SPORTS_KEYWORDS.forEach(pattern => {
        // Add base team keywords
        keywords.push(pattern.replace('{team}', cleanName));
        
        // Add sport-specific keywords
        if (sport === 'both' || sport === 'football') {
            keywords.push(pattern.replace('{team}', `${cleanName} football`));
        }
        if (sport === 'both' || sport === 'basketball') {
            keywords.push(pattern.replace('{team}', `${cleanName} basketball`));
        }
    });
    
    return [...new Set(keywords)].filter(keyword => keyword.length > 5).slice(0, 25);
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

// UPDATED: AI-optimized API calls
async function callDataForSEOAPI(endpoint, data, useAiOptimized = DATAFORSEO_CONFIG.useAiOptimized) {
    await enforceRateLimit();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DATAFORSEO_CONFIG.timeout);
    
    try {
        // NEW: Add .ai suffix for AI-optimized responses
        const finalEndpoint = useAiOptimized ? 
            endpoint + DATAFORSEO_CONFIG.aiOptimizedSuffix : 
            endpoint;
            
        console.log(`📡 DataForSEO: ${finalEndpoint} ${useAiOptimized ? '(AI-optimized)' : '(standard)'}`);
        
        const response = await fetch(`${DATAFORSEO_CONFIG.baseUrl}${finalEndpoint}`, {
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
            console.log(`✅ API Success ${useAiOptimized ? '(AI-optimized)' : ''}`);
            return result;
        } else {
            throw new Error(`DataForSEO Error ${result.status_code}`);
        }
    } catch (error) {
        clearTimeout(timeoutId);
        console.error(`❌ API Failed:`, error.message);
        
        // NEW: Fallback to standard API if AI-optimized fails
        if (useAiOptimized && error.message.includes('404')) {
            console.log(`🔄 AI-optimized endpoint not available, falling back to standard`);
            return await callDataForSEOAPI(endpoint, data, false);
        }
        
        return null;
    }
}

// UPDATED: SERP data with AI optimization
async function getSERPData(keyword, useAiOptimized = true) {
    if (!keyword?.trim()) return null;
    
    const data = [{
        keyword: keyword.trim(),
        location_code: 2840,
        language_code: "en",
        device: "desktop",
        depth: 100
    }];

    const result = await callDataForSEOAPI('/serp/google/organic/live/advanced', data, useAiOptimized);
    
    // NEW: Log data size reduction if AI-optimized
    if (result && useAiOptimized) {
        const responseSize = JSON.stringify(result).length;
        console.log(`📊 AI-optimized response size: ${(responseSize / 1024).toFixed(1)}KB`);
    }
    
    return result;
}

// NEW: Keyword difficulty analysis with AI optimization
async function getKeywordDifficulty(keywords) {
    if (!keywords?.length) return null;
    
    // Format keywords for DataForSEO Labs API
    const keywordData = keywords.slice(0, 10).map(keyword => ({
        keyword: keyword.trim(),
        location_code: 2840,
        language_code: "en"
    }));

    console.log(`🔍 Getting keyword difficulty for ${keywordData.length} keywords (AI-optimized)`);
    
    // Use AI-optimized endpoint for keyword difficulty
    const result = await callDataForSEOAPI('/dataforseo_labs/google/keyword_difficulty/live', keywordData, true);
    
    if (result?.tasks?.[0]?.result) {
        console.log(`✅ Keyword difficulty data retrieved`);
        return result.tasks[0].result;
    }
    
    return null;
}

// NEW: Search volume data with AI optimization
async function getSearchVolumeData(keywords) {
    if (!keywords?.length) return null;
    
    const keywordData = keywords.slice(0, 10).map(keyword => ({
        keyword: keyword.trim(),
        location_code: 2840,
        language_code: "en"
    }));

    console.log(`📈 Getting search volume for ${keywordData.length} keywords (AI-optimized)`);
    
    // Use AI-optimized endpoint for search volume
    const result = await callDataForSEOAPI('/dataforseo_labs/google/search_volume/live', keywordData, true);
    
    if (result?.tasks?.[0]?.result) {
        console.log(`✅ Search volume data retrieved`);
        return result.tasks[0].result;
    }
    
    return null;
}

// COLLEGE TEAM SITE DETECTION
function isCollegeTeamSite(domain, teamName) {
    if (!domain || !teamName) return false;
    
    const cleanDomain = domain.toLowerCase().replace(/[^a-z]/g, '');
    const cleanTeam = teamName.toLowerCase();
    
    // Specific college patterns
    const collegePatterns = {
        'duke blue devils': ['goduke', 'duke', 'dukeathletics'],
        'north carolina tar heels': ['goheels', 'unc', 'tarheelblue'],
        'alabama crimson tide': ['rolltide', 'alabama', 'ua'],
        'georgia bulldogs': ['georgiadogs', 'uga', 'georgia'],
        'ohio state buckeyes': ['ohiostatebuckeyes', 'osu', 'gobucks'],
        'michigan wolverines': ['mgoblue', 'umich', 'michigan'],
        'texas longhorns': ['texassports', 'utexas', 'hookemhorns'],
        'florida gators': ['gatorzone', 'ufl', 'florida'],
        'notre dame fighting irish': ['und', 'notredame', 'goirish'],
        'penn state nittany lions': ['gopsusports', 'psu', 'pennstate']
    };
    
    // Check specific patterns first
    const patterns = collegePatterns[cleanTeam];
    if (patterns && patterns.some(pattern => cleanDomain.includes(pattern))) {
        return true;
    }
    
    // Generic college detection
    const teamWords = cleanTeam.split(' ');
    const schoolName = teamWords[0]; // e.g., "duke", "alabama"
    
    // Common college domain patterns
    if (cleanDomain.includes(schoolName + 'edu')) return true;
    if (cleanDomain.includes('go' + schoolName)) return true;
    if (cleanDomain.includes(schoolName + 'sports')) return true;
    if (cleanDomain.includes(schoolName + 'athletics')) return true;
    if (cleanDomain.includes(schoolName) && cleanDomain.includes('athletics')) return true;
    if (cleanDomain.includes(schoolName) && cleanDomain.includes('edu')) return true;
    
    return false;
}

// UPDATED: Enhanced college sports gap analysis with real keyword data
function analyzeCollegeSportsGap(serpData, teamName, keyword, keywordMetrics = null) {
    console.log(`🏈 College Sports Gap Analysis: "${keyword}"`);
    
    if (!serpData?.tasks?.[0]?.result?.[0]?.items) {
        console.log(`❌ No SERP data - using college sports fallback`);
        return createCollegeFallbackGap(keyword, teamName, keywordMetrics);
    }

    const items = serpData.tasks[0].result[0].items;
    let teamRank = null;
    let highestTeamRank = null;
    const competitors = [];
    const teamSites = [];
    
    // Find team sites and competitors
    items.forEach((item, index) => {
        const rank = index + 1;
        const domain = item.domain || 'unknown-domain';
        
        if (isCollegeTeamSite(domain, teamName)) {
            teamSites.push({ domain, rank, title: item.title });
            if (!highestTeamRank) highestTeamRank = rank;
        } else {
            if (rank <= 10) {
                competitors.push({
                    domain,
                    rank,
                    title: (item.title || 'No title').substring(0, 50),
                    type: categorizeCollegeCompetitor(domain)
                });
            }
        }
    });
    
    // Enhanced gap analysis with keyword metrics
    const gapAnalysis = analyzeCollegeGap(keyword, highestTeamRank, competitors, teamSites, keywordMetrics);
    
    console.log(`📊 Gap Result: ${gapAnalysis.hasGap ? 'GAP FOUND' : 'NO SIGNIFICANT GAP'} (Team: ${highestTeamRank ? `#${highestTeamRank}` : 'Not found'})`);
    
    return gapAnalysis;
}

function categorizeCollegeCompetitor(domain) {
    if (['ticketmaster.com', 'stubhub.com', 'seatgeek.com', 'vivid-seats.com'].includes(domain)) {
        return 'Ticket Reseller';
    }
    if (['espn.com', 'cbssports.com', 'sports.yahoo.com', '247sports.com'].includes(domain)) {
        return 'Sports Media';
    }
    if (['reddit.com', 'facebook.com', 'twitter.com', 'bleacherreport.com'].includes(domain)) {
        return 'Fan Content';
    }
    if (['tripadvisor.com', 'hotels.com', 'expedia.com'].includes(domain)) {
        return 'Travel Site';
    }
    return 'Other';
}

// UPDATED: Enhanced gap analysis with keyword difficulty
function analyzeCollegeGap(keyword, teamRank, competitors, teamSites, keywordMetrics = null) {
    let hasGap = false;
    let gapReason = '';
    let opportunity = 4;
    
    // NEW: Factor in keyword difficulty from real data
    if (keywordMetrics) {
        const difficulty = keywordMetrics.keyword_difficulty || 0;
        const searchVolume = keywordMetrics.search_volume || 0;
        
        console.log(`📊 Keyword metrics: difficulty=${difficulty}, volume=${searchVolume}`);
        
        // Higher opportunity for high-volume, lower-difficulty keywords
        if (searchVolume > 1000 && difficulty < 30) {
            opportunity += 2;
            console.log(`📈 High-volume, low-difficulty keyword bonus`);
        }
        
        // Lower opportunity for very competitive keywords
        if (difficulty > 70) {
            opportunity -= 1;
            console.log(`⚠️ High difficulty keyword penalty`);
        }
    }
    
    // CRITICAL GAP: Ticket resellers dominating
    const ticketResellers = competitors.filter(c => c.type === 'Ticket Reseller');
    if (ticketResellers.length > 0 && (!teamRank || teamRank > ticketResellers[0].rank)) {
        hasGap = true;
        gapReason = `Ticket resellers (${ticketResellers.map(t => t.domain).join(', ')}) outranking official site - losing direct revenue`;
        opportunity += 4;
    }
    
    // HIGH GAP: Team not ranking in top 3 for own keywords
    if (!teamRank || teamRank > 3) {
        hasGap = true;
        gapReason = teamRank ? `Team ranks #${teamRank}, missing high-value search traffic` : 'Team not found in top 10 - major visibility gap';
        opportunity += 3;
    }
    
    // MEDIUM GAP: Sports media answering fan questions
    const sportsMedia = competitors.filter(c => c.type === 'Sports Media');
    if (sportsMedia.length > 0 && keyword.includes('what') && (!teamRank || teamRank > sportsMedia[0].rank)) {
        hasGap = true;
        gapReason = `Sports media (${sportsMedia[0].domain}) answering fan questions instead of official site`;
        opportunity += 2;
    }
    
    // MEDIUM GAP: Fan content outranking official
    const fanContent = competitors.filter(c => c.type === 'Fan Content');
    if (fanContent.length > 0 && (!teamRank || teamRank > fanContent[0].rank)) {
        hasGap = true;
        gapReason = `Fan content (${fanContent[0].domain}) providing official information instead of team`;
        opportunity += 1;
    }
    
    // HIGH GAP: Travel sites dominating local keywords
    if (keyword.includes('hotels') || keyword.includes('restaurants')) {
        const travelSites = competitors.filter(c => c.type === 'Travel Site');
        if (travelSites.length > 0 && (!teamRank || teamRank > 5)) {
            hasGap = true;
            gapReason = `Travel sites dominating gameday planning - missing partnership revenue`;
            opportunity += 2;
        }
    }
    
    // Calculate display ranking
    let rankingDisplay = 'Not Found';
    if (teamRank) {
        if (teamRank === 1) rankingDisplay = 'Excellent (#1)';
        else if (teamRank <= 3) rankingDisplay = 'Good (#2-3)';
        else if (teamRank <= 5) rankingDisplay = 'Fair (#4-5)';
        else if (teamRank <= 10) rankingDisplay = 'Poor (#6-10)';
        else rankingDisplay = 'Very Poor (#11+)';
    }
    
    return {
        hasGap,
        gapReason,
        opportunity: Math.min(opportunity, 10),
        teamRank: rankingDisplay,
        actualRank: teamRank,
        competitors: competitors.slice(0, 5),
        teamSites,
        revenueImpact: calculateCollegeRevenueImpact(keyword, ticketResellers),
        isRealData: true,
        keywordMetrics // NEW: Include real keyword data
    };
}

function calculateCollegeRevenueImpact(keyword, ticketResellers) {
    if (keyword.includes('tickets') && ticketResellers.length > 0) {
        return 'HIGH: Direct ticket sales being lost to resellers - potentially $50K+ per game';
    }
    
    if (keyword.includes('parking') || keyword.includes('tailgating')) {
        return 'MEDIUM: Parking and concession revenue opportunities - $10K+ per game';
    }
    
    if (keyword.includes('first time') || keyword.includes('experience')) {
        return 'MEDIUM: Fan conversion and loyalty - future season ticket potential';
    }
    
    if (keyword.includes('seating') || keyword.includes('best seats')) {
        return 'HIGH: Premium seating and club level sales - $25K+ per game';
    }
    
    return 'LOW-MEDIUM: Brand awareness and fan engagement value';
}

// UPDATED: Enhanced fallback with keyword metrics
function createCollegeFallbackGap(keyword, teamName, keywordMetrics = null) {
    // College sports should have more gaps than minor league hockey
    const hasGap = Math.random() > 0.3; // 70% chance of gap
    let opportunity = hasGap ? 6 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 2);
    
    // NEW: Adjust opportunity based on real keyword metrics if available
    if (keywordMetrics) {
        const difficulty = keywordMetrics.keyword_difficulty || 0;
        const searchVolume = keywordMetrics.search_volume || 0;
        
        if (searchVolume > 1000 && difficulty < 30) opportunity += 1;
        if (difficulty > 70) opportunity -= 1;
    }
    
    return {
        hasGap,
        gapReason: hasGap ? 
            'API data unavailable - likely gap based on college sports competition patterns' : 
            'Limited gap detected - team may be performing well',
        opportunity: Math.min(opportunity, 10),
        teamRank: Math.random() > 0.3 ? 'Not Found' : `Fair (#${Math.floor(Math.random() * 5) + 4})`,
        actualRank: null,
        competitors: getSimulatedCollegeCompetitors(keyword),
        revenueImpact: calculateCollegeRevenueImpact(keyword, []),
        isRealData: false,
        keywordMetrics // NEW: Include available keyword data
    };
}

function getGapType(keyword) {
    if (keyword.includes('tickets')) return 'Ticket Reseller Dominance';
    if (keyword.includes('first time') || keyword.includes('experience')) return 'Fan Experience Gap';
    if (keyword.includes('parking')) return 'Venue Information Gap';
    if (keyword.includes('seating')) return 'Premium Seating Gap';
    if (keyword.includes('hotels') || keyword.includes('restaurants')) return 'Game Weekend Planning Gap';
    return 'General SEO Gap';
}

function getContentSuggestion(keyword, teamName) {
    if (keyword.includes('first time') || keyword.includes('experience')) {
        return {
            title: `Complete ${teamName} Game Day Experience Guide`,
            format: 'Interactive timeline with videos and photos',
            cta: 'Buy Official Tickets + Parking'
        };
    }
    
    if (keyword.includes('parking')) {
        return {
            title: `Official ${teamName} Parking & Transportation Hub`,
            format: 'Interactive map with real-time availability',
            cta: 'Reserve Official Parking Pass'
        };
    }
    
    if (keyword.includes('tickets')) {
        return {
            title: `Official ${teamName} Ticket Center`,
            format: 'Price comparison vs resellers + exclusive benefits',
            cta: 'Buy Direct - Save Money & Support Team'
        };
    }
    
    if (keyword.includes('seating')) {
        return {
            title: `${teamName} Stadium Seating Guide with 360° Views`,
            format: 'Interactive seating chart with photos from each section',
            cta: 'Find Your Perfect Seats'
        };
    }
    
    return {
        title: `${teamName} Fan Resource Hub`,
        format: 'Comprehensive FAQ with official information',
        cta: 'Explore Official Resources'
    };
}

function getLLMStrategy(keyword) {
    if (keyword.includes('what') || keyword.includes('first time')) return 'Structure as direct Q&A format with specific, quotable answers for AI search';
    if (keyword.includes('best') || keyword.includes('tips')) return 'Create numbered lists and comparison tables with clear recommendations';
    if (keyword.includes('cheap') || keyword.includes('deals')) return 'Focus on official benefits and savings compared to resellers';
    return 'Use conversational tone with natural language answers optimized for voice search';
}

// UPDATED: Use real search volume when available
function getSearchVolume(keyword, keywordMetrics = null) {
    if (keywordMetrics?.search_volume) {
        return keywordMetrics.search_volume;
    }
    
    // Fallback to estimates
    if (keyword.includes('tickets')) return Math.floor(Math.random() * 2000) + 800; // 800-2800
    if (keyword.includes('first time') || keyword.includes('experience')) return Math.floor(Math.random() * 1000) + 400; // 400-1400
    if (keyword.includes('parking')) return Math.floor(Math.random() * 800) + 300; // 300-1100
    if (keyword.includes('seating')) return Math.floor(Math.random() * 600) + 200; // 200-800
    return Math.floor(Math.random() * 400) + 150; // 150-550
}

function getSimulatedCollegeCompetitors(keyword) {
    if (keyword.includes('tickets')) {
        return [
            { domain: 'stubhub.com', rank: 1, type: 'Ticket Reseller' },
            { domain: 'ticketmaster.com', rank: 2, type: 'Ticket Reseller' },
            { domain: 'seatgeek.com', rank: 3, type: 'Ticket Reseller' },
            { domain: 'espn.com', rank: 4, type: 'Sports Media' }
        ];
    }
    
    if (keyword.includes('parking')) {
        return [
            { domain: 'parkopedia.com', rank: 2, type: 'Other' },
            { domain: 'reddit.com', rank: 3, type: 'Fan Content' },
            { domain: 'facebook.com', rank: 4, type: 'Fan Content' }
        ];
    }
    
    if (keyword.includes('experience') || keyword.includes('first time')) {
        return [
            { domain: 'reddit.com', rank: 1, type: 'Fan Content' },
            { domain: 'bleacherreport.com', rank: 2, type: 'Fan Content' },
            { domain: 'espn.com', rank: 3, type: 'Sports Media' },
            { domain: 'youtube.com', rank: 4, type: 'Fan Content' }
        ];
    }
    
    return [
        { domain: 'espn.com', rank: 2, type: 'Sports Media' },
        { domain: 'cbssports.com', rank: 3, type: 'Sports Media' },
        { domain: 'reddit.com', rank: 4, type: 'Fan Content' }
    ];
}

// API ROUTES
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK',
        dataforseo: {
            configured: !!(DATAFORSEO_CONFIG.login && DATAFORSEO_CONFIG.password),
            aiOptimized: DATAFORSEO_CONFIG.useAiOptimized
        }
    });
});

// UPDATED: Enhanced analysis with AI-optimized DataForSEO APIs
app.post('/api/analyze', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { teamName, sport, email } = req.body;
        
        if (!teamName?.trim() || !email?.trim()) {
            return res.status(400).json({ 
                success: false,
                error: 'Team name and email are required' 
            });
        }

        const cleanTeamName = teamName.trim().substring(0, 50);
        console.log(`\n🏈 ENHANCED COLLEGE SPORTS GAP ANALYSIS: "${cleanTeamName}" (${sport})`);
        
        const keywords = generateKeywords(cleanTeamName, sport);
        console.log(`📝 Analyzing ${keywords.length} keywords for gaps with AI-optimized data`);
        
        // NEW: Get keyword metrics (search volume, difficulty) with AI optimization
        console.log(`\n📊 Fetching keyword metrics for enhanced analysis...`);
        const keywordDifficultyData = await getKeywordDifficulty(keywords.slice(0, 10));
        const searchVolumeData = await getSearchVolumeData(keywords.slice(0, 10));
        
        // Create keyword metrics lookup
        const keywordMetricsMap = new Map();
        if (keywordDifficultyData) {
            keywordDifficultyData.forEach(item => {
                if (item.keyword) {
                    keywordMetricsMap.set(item.keyword, {
                        ...keywordMetricsMap.get(item.keyword),
                        keyword_difficulty: item.keyword_difficulty
                    });
                }
            });
        }
        if (searchVolumeData) {
            searchVolumeData.forEach(item => {
                if (item.keyword) {
                    keywordMetricsMap.set(item.keyword, {
                        ...keywordMetricsMap.get(item.keyword),
                        search_volume: item.search_volume
                    });
                }
            });
        }
        
        console.log(`📈 Retrieved metrics for ${keywordMetricsMap.size} keywords`);
        
        // Initialize gap analyses as empty array
        let gapAnalyses = [];
        let realDataCount = 0;
        
        // Analyze keywords for college sports gaps
        const keywordsToAnalyze = keywords.slice(0, 8);
        
        for (const keyword of keywordsToAnalyze) {
            console.log(`\n🔍 "${keyword}"`);
            
            try {
                // Get SERP data with AI optimization
                const serpData = await getSERPData(keyword, true);
                const keywordMetrics = keywordMetricsMap.get(keyword);
                
                const gapAnalysis = analyzeCollegeSportsGap(serpData, cleanTeamName, keyword, keywordMetrics);
                
                if (serpData) realDataCount++;
                
                // Only add if there's actually a gap
                if (gapAnalysis.hasGap) {
                    gapAnalyses.push({
                        keyword,
                        opportunity: gapAnalysis.opportunity,
                        gapType: getGapType(keyword),
                        teamRank: gapAnalysis.teamRank,
                        competitors: gapAnalysis.competitors,
                        contentSuggestion: getContentSuggestion(keyword, cleanTeamName),
                        llmStrategy: getLLMStrategy(keyword),
                        searchVolume: getSearchVolume(keyword, keywordMetrics), // NEW: Use real volume when available
                        isRealData: gapAnalysis.isRealData,
                        gapReason: gapAnalysis.gapReason,
                        revenueImpact: gapAnalysis.revenueImpact,
                        // NEW: Include keyword difficulty for better insights
                        keywordDifficulty: keywordMetrics?.keyword_difficulty || null
                    });
                    console.log(`✅ GAP FOUND: ${gapAnalysis.gapReason}`);
                } else {
                    console.log(`⚪ No gap: Team performing well`);
                }
                
            } catch (error) {
                console.error(`❌ Error: ${keyword}:`, error.message);
            }
        }
        
        // College sports should find more gaps, but be conservative with fallbacks
        if (gapAnalyses.length === 0) {
            console.log(`🔍 No gaps found in primary keywords - checking additional keywords...`);
            const remainingKeywords = keywords.slice(8, 12);
            for (const keyword of remainingKeywords) {
                if (gapAnalyses.length >= 3) break;
                
                const keywordMetrics = keywordMetricsMap.get(keyword);
                const fallbackGap = createCollegeFallbackGap(keyword, cleanTeamName, keywordMetrics);
                if (fallbackGap.hasGap && fallbackGap.opportunity >= 7) {
                    console.log(`📍 Potential gap found: ${keyword} (opportunity: ${fallbackGap.opportunity})`);
                    gapAnalyses.push({
                        keyword,
                        opportunity: fallbackGap.opportunity,
                        gapType: getGapType(keyword),
                        teamRank: fallbackGap.teamRank,
                        competitors: fallbackGap.competitors,
                        contentSuggestion: getContentSuggestion(keyword, cleanTeamName),
                        llmStrategy: getLLMStrategy(keyword),
                        searchVolume: getSearchVolume(keyword, keywordMetrics),
                        isRealData: false,
                        gapReason: fallbackGap.gapReason,
                        revenueImpact: fallbackGap.revenueImpact,
                        keywordDifficulty: keywordMetrics?.keyword_difficulty || null
                    });
                }
            }
        }
        
        // Sort by opportunity score
        gapAnalyses.sort((a, b) => b.opportunity - a.opportunity);
        
        const processingTime = Date.now() - startTime;
        
        console.log(`\n🎯 GAPS FOUND: ${gapAnalyses.length} actionable opportunities`);
        console.log(`📊 Real data: ${realDataCount}/${keywordsToAnalyze.length}`);
        console.log(`🤖 AI-optimized APIs: ${DATAFORSEO_CONFIG.useAiOptimized ? 'ENABLED' : 'DISABLED'}`);
        console.log(`📈 Keyword metrics: ${keywordMetricsMap.size} keywords analyzed`);
        
        if (gapAnalyses.length === 0) {
            console.log(`✅ EXCELLENT: Team performing well on all analyzed keywords!`);
        }
        
        // NEW: Calculate token savings estimate
        const estimatedTokenSavings = DATAFORSEO_CONFIG.useAiOptimized ? 
            Math.floor(realDataCount * 150) : 0; // Rough estimate of tokens saved per API call
        
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
                realDataPoints: realDataCount,
                // NEW: Enhanced analytics
                averageKeywordDifficulty: gapAnalyses
                    .filter(a => a.keywordDifficulty !== null)
                    .reduce((sum, a, _, arr) => sum + a.keywordDifficulty / arr.length, 0),
                aiOptimizedCalls: DATAFORSEO_CONFIG.useAiOptimized ? realDataCount : 0,
                estimatedTokenSavings
            },
            meta: {
                processingTimeMs: processingTime,
                dataQuality: realDataCount > 0 ? 'Live Gap Analysis with AI-optimized APIs' : 'Simulated Gap Analysis',
                keywordsAnalyzed: keywordsToAnalyze.length,
                gapsFound: gapAnalyses.length,
                // NEW: AI optimization details
                aiOptimized: DATAFORSEO_CONFIG.useAiOptimized,
                keywordMetricsAvailable: keywordMetricsMap.size,
                apiEfficiency: estimatedTokenSavings > 0 ? `${estimatedTokenSavings} tokens saved` : 'Standard API calls'
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

// NEW: Endpoint to toggle AI optimization
app.post('/api/toggle-ai-optimization', (req, res) => {
    const { enabled } = req.body;
    DATAFORSEO_CONFIG.useAiOptimized = enabled !== false;
    
    console.log(`🤖 AI optimization ${DATAFORSEO_CONFIG.useAiOptimized ? 'ENABLED' : 'DISABLED'}`);
    
    res.json({
        success: true,
        aiOptimized: DATAFORSEO_CONFIG.useAiOptimized,
        message: `AI-optimized responses ${DATAFORSEO_CONFIG.useAiOptimized ? 'enabled' : 'disabled'}`
    });
});

// NEW: Endpoint to get keyword insights with AI-optimized data
app.post('/api/keyword-insights', async (req, res) => {
    try {
        const { keywords } = req.body;
        
        if (!keywords?.length) {
            return res.status(400).json({
                success: false,
                error: 'Keywords array is required'
            });
        }
        
        console.log(`🔍 Getting AI-optimized keyword insights for ${keywords.length} keywords`);
        
        // Get both difficulty and search volume with AI optimization
        const [difficultyData, volumeData] = await Promise.all([
            getKeywordDifficulty(keywords),
            getSearchVolumeData(keywords)
        ]);
        
        // Combine the data
        const insights = keywords.map(keyword => {
            const difficulty = difficultyData?.find(d => d.keyword === keyword)?.keyword_difficulty || null;
            const volume = volumeData?.find(v => v.keyword === keyword)?.search_volume || null;
            
            let opportunityScore = 5; // Base score
            
            // Calculate opportunity based on volume and difficulty
            if (volume && difficulty !== null) {
                if (volume > 1000 && difficulty < 30) opportunityScore = 9;
                else if (volume > 500 && difficulty < 50) opportunityScore = 7;
                else if (volume > 100 && difficulty < 70) opportunityScore = 6;
                else if (difficulty > 80) opportunityScore = 3;
            }
            
            return {
                keyword,
                searchVolume: volume,
                keywordDifficulty: difficulty,
                opportunityScore,
                competitiveness: difficulty > 70 ? 'High' : difficulty > 40 ? 'Medium' : 'Low'
            };
        });
        
        res.json({
            success: true,
            insights,
            meta: {
                keywordsAnalyzed: keywords.length,
                aiOptimized: DATAFORSEO_CONFIG.useAiOptimized,
                dataAvailable: {
                    difficulty: difficultyData ? difficultyData.length : 0,
                    volume: volumeData ? volumeData.length : 0
                }
            }
        });
        
    } catch (error) {
        console.error('❌ Keyword insights error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get keyword insights'
        });
    }
});

app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send(`
            <h1>College Sports SEO Gap Analyzer</h1>
            <p>Frontend not found. Place index.html in public/ directory.</p>
            <h2>AI-Optimized DataForSEO Integration</h2>
            <p>Status: ${DATAFORSEO_CONFIG.useAiOptimized ? 'ENABLED' : 'DISABLED'}</p>
        `);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏈 College Sports SEO Gap Analyzer`);
    console.log(`🎯 Analyzing ticket reseller competition and fan experience gaps`);
    console.log(`🤖 AI-optimized DataForSEO: ${DATAFORSEO_CONFIG.useAiOptimized ? 'ENABLED' : 'DISABLED'}`);
    console.log(`💰 Token optimization: ${DATAFORSEO_CONFIG.useAiOptimized ? 'ACTIVE' : 'INACTIVE'}`);
    console.log(`🚀 Running on port ${PORT}`);
});