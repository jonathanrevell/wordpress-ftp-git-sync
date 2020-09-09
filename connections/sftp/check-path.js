const Paths      = require("../../paths.js");
const micromatch = require("micromatch");

/**
 * Must match ANY positive pattern and must NOT fail ANY negative pattern
 * @param {*} relativePath 
 * @param {*} type 
 */
function checkPath(relativePath, type) {
    var includeMatch = Paths.include.length === 0 || micromatch.isMatch(relativePath, Paths.include);
    var excludeMatch = Paths.exclude.length === 0 ? false : micromatch.isMatch(relativePath, Paths.exclude, { matchBase: true });

    if(excludeMatch) {
        return false;
    }
    if(includeMatch) {
        return true;
    }

    // If the current path is a directory then allow "anticipatory" matches
    // Meaning, if a partial pattern matches a partial path, then keep exploring
    if(type === "d") {
        var anyMatches = false;
        Paths.include.forEach(p => {
            let patternSegments = p.split("/");
            let pathSegments = relativePath.split("/");

            if(patternSegments.length > 0 && patternSegments[0] === "") {
                patternSegments.shift();
            }
            if(pathSegments.length > 0 && pathSegments[0] === "") {
                pathSegments.shift();
            }
    
            let workingPath = pathSegments.shift();
            let workingPattern = patternSegments.shift();

            let pathSeg = workingPath;
            let patternSeg = workingPattern;
            let patternSegmentMatches = 0;
    
            var isMatching = micromatch.isMatch(workingPath, workingPattern);

            function useNextPatternSegment() {
                patternSeg = patternSegments.shift();
                workingPattern += "/" + patternSeg;
                patternSegmentMatches = 0;
            }
    
            // Keep working through the path segments as long as they satisfy the pattern segments
            // Stop once we've evaluated the entire path
            while(pathSegments.length > 0 && isMatching) {
                pathSeg = pathSegments.shift();
                workingPath += "/" + pathSeg;
                patternSegmentMatches++;
                let mm = micromatch.scan(patternSeg);

                if(patternSegments.length > 0) {
                        
                    if(mm.isGlobstar && pathSegments.length > 0) {
                        let nextPathSeg = pathSegments[0];
                        let nextPatternSeg = patternSegments[0];

                        // Keep matching the globstar 
                        // until the next path segment matches the next pattern segment
                        if(micromatch.isMatch(nextPathSeg, nextPatternSeg)) {
                            useNextPatternSegment();
                        }
                    } else {
                        useNextPatternSegment();
                    }
                } else if(!mm.isGlobstar) {
                    isMatching = false;
                    break;
                }

                if(micromatch.isMatch(workingPath, workingPattern)) {
                    isMatching = true;
                } else {
                    isMatching = false;
                    break;
                }
            }
            if(isMatching) {
                anyMatches = true;
            }
        });

        return anyMatches;
    } else {
        return false;
    }
}

module.exports = checkPath;