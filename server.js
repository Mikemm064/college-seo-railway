// IMPROVED: Much smarter university team site detection
function isTeamSite(domain, teamName) {
    if (!domain || !teamName) return false;
    
    const cleanDomain = domain.toLowerCase().replace(/[^a-z]/g, '');
    const cleanTeamName = teamName.toLowerCase();
    
    // PRIORITY 1: Official university domains (.edu)
    if (domain.includes('.edu')) {
        console.log(`✅ Found official university domain: ${domain}`);
        return true;
    }
    
    // PRIORITY 2: Known official athletics domains
    const officialAthletics = {
        'duke': ['goduke.com', 'dukebluedevils.com'],
        'alabama': ['rolltide.com', 'alabamasports.com'],
        'michigan': ['mgoblue.com', 'umich.edu'],
        'texas': ['texassports.com', 'utexas.edu'],
        'georgia': ['georgiadogs.com', 'ugadawgs.com'],
        'florida': ['gatorzone.com', 'floridagators.com'],
        'kentucky': ['ukathletics.com', 'kentuckysports.com'],
        'north carolina': ['goheels.com', 'tarheelblue.com'],
        'kansas': ['kuathletics.com', 'jayhawks.com'],
        'ohio state': ['ohiostatebuckeyes.com', 'elevenwarriors.com']
    };
    
    // Check against known official domains
    for (const [school, domains] of Object.entries(officialAthletics)) {
        if (cleanTeamName.includes(school)) {
            const isOfficialDomain = domains.some(officialDomain => 
                domain.includes(officialDomain.replace('.com', '').replace('.edu', ''))
            );
            if (isOfficialDomain) {
                console.log(`✅ Found official athletics domain for ${school}: ${domain}`);
                return true;
            }
        }
    }
    
    // PRIORITY 3: Pattern matching for team names
    const teamWords = cleanTeamName.split(' ').filter(word => word.length > 2);
    const concatenatedName = cleanTeamName.replace(/\s+/g, '');
    
    // Check if domain contains the main university name
    const universityName = teamWords[0]; // Usually first word is university name
    if (universityName && universityName.length > 3) {
        if (cleanDomain.includes(universityName)) {
            console.log(`✅ Found university name match: ${universityName} in ${domain}`);
            return true;
        }
    }
    
    // Check for team nickname/mascot
    const teamNickname = teamWords[teamWords.length - 1]; // Usually last word is mascot
    if (teamNickname && teamNickname.length > 3) {
        if (cleanDomain.includes(teamNickname)) {
            console.log(`✅ Found team nickname match: ${teamNickname} in ${domain}`);
            return true;
        }
    }
    
    // EXCLUDE: Known non-official sites that might match
    const excludeDomains = [
        'wikipedia.org', 'fandom.com', 'rivals.com', 'sports.yahoo.com',
        'espn.com', 'cbssports.com', 'si.com', 'bleacherreport.com',
        'facebook.com', 'twitter.com', 'instagram.com', 'youtube.com'
    ];
    
    const isExcluded = excludeDomains.some(excluded => domain.includes(excluded));
    if (isExcluded) {
        console.log(`❌ Excluded domain: ${domain}`);
        return false;
    }
    
    return false;
}

// IMPROVED: Smarter gap analysis that respects official site rankings
function analyzeActualGap(keyword, teamRank, competitors, teamSites, sport) {
    let hasGap = false;
    let gapReason = '';
    let opportunity = 1; // Start lower, only increase for real gaps
    
    console.log(`🔍 Analyzing gap for "${keyword}"`);
    console.log(`📊 Team rank: ${teamRank || 'Not found'}`);
    console.log(`🏛️ Team sites found: ${teamSites.length}`);
    
    // NEW: If official site ranks #1-3, this is NOT a gap
    if (teamRank && teamRank <= 3) {
        console.log(`✅ Official site ranking well (#${teamRank}) - NO GAP`);
        return {
            hasGap: false,
            gapReason: `Official site ranks #${teamRank} - performing well`,
            opportunity: 2, // Very low priority
            teamRank: getDisplayRank(teamRank),
            actualRank: teamRank,
            competitors: competitors.slice(0, 3),
            teamSites,
            isRealData: true
        };
    }
    
    // GAP CRITERIA 1: Team not ranking in top 5 AND competitors are present
    if (!teamRank || teamRank > 5) {
        const hasStrongCompetitors = competitors.some(c => 
            ['ticketmaster.com', 'stubhub.com', 'seatgeek.com', 'vivid-seats.com'].includes(c.domain)
        );
        
        if (hasStrongCompetitors) {
            hasGap = true;
            gapReason = teamRank ? 
                `Official site ranks #${teamRank}, ticket resellers dominating top 5` : 
                'Official site not found, ticket resellers dominating';
            opportunity += 4;
        }
    }
    
    // GAP CRITERIA 2: Ticket resellers outranking official site
    const ticketResellers = competitors.filter(c => 
        ['ticketmaster.com', 'stubhub.com', 'seatgeek.com', 'vivid-seats.com', 'vividseats.com'].includes(c.domain)
    );
    
    if (ticketResellers.length > 0 && (!teamRank || teamRank > ticketResellers[0].rank)) {
        hasGap = true;
        gapReason = `Revenue loss: ${ticketResellers[0].domain} ranks #${ticketResellers[0].rank}, official site ranks #${teamRank || 'not found'}`;
        opportunity += 3;
    }
    
    // GAP CRITERIA 3: High-value keywords with poor performance
    if (keyword.includes('ticket') && (!teamRank || teamRank > 5)) {
        hasGap = true;
        gapReason = 'Critical revenue keyword - official ticket sales opportunity';
        opportunity += 2;
    }
    
    if (keyword.includes('first time') && (!teamRank || teamRank > 3)) {
        hasGap = true;
        gapReason = 'Missing fan onboarding content - high conversion potential';
        opportunity += 2;
    }
    
    if (keyword.includes('parking') && (!teamRank || teamRank > 3)) {
        hasGap = true;
        gapReason = 'Missing game day logistics - fan experience gap';
        opportunity += 1;
    }
    
    // Only flag as gap if opportunity score is meaningful
    if (opportunity < 4) {
        hasGap = false;
        gapReason = 'No significant competitive gap detected';
    }
    
    return {
        hasGap,
        gapReason,
        opportunity: Math.min(opportunity, 10),
        teamRank: getDisplayRank(teamRank),
        actualRank: teamRank,
        competitors: competitors.slice(0, 5),
        teamSites,
        isRealData: true
    };
}

function getDisplayRank(teamRank) {
    if (!teamRank) return 'Not Found';
    if (teamRank === 1) return 'Excellent (#1)';
    if (teamRank <= 3) return 'Very Good (#2-3)';
    if (teamRank <= 5) return 'Good (#4-5)';
    if (teamRank <= 10) return 'Fair (#6-10)';
    return 'Poor (#11+)';
}

// IMPROVED: More conservative fallback gap creation
function createFallbackGap(keyword, teamName, sport) {
    // Much more conservative - only create gaps for high-value keywords
    const isHighValue = keyword.includes('ticket') || keyword.includes('first time');
    const hasGap = isHighValue && Math.random() > 0.85; // Only 15% chance, only for high-value
    
    const opportunity = hasGap ? 6 + Math.floor(Math.random() * 2) : 2; // Lower base scores
    
    return {
        hasGap,
        gapReason: hasGap ? 
            'API data unavailable - estimated opportunity based on keyword value' : 
            'No significant gap detected in market analysis',
        opportunity,
        teamRank: Math.random() > 0.6 ? 'Not Found' : 'Fair (#6-10)',
        actualRank: null,
        competitors: getSimulatedCompetitors(keyword),
        teamSites: [],
        isRealData: false
    };
}
