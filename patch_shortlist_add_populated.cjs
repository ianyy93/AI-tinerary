const fs = require('fs');
let content = fs.readFileSync('src/components/timeline/ItineraryTimeline.tsx', 'utf8');

const regex = /          \) : \(\n\s*shortlistItems\.map/;

content = content.replace(regex, `          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end mb-2">
                {userRole !== 'viewer' && (
                  <button 
                    onClick={() => setIsShortlistModalOpen(true)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-lg transition shadow-sm"
                  >
                    + Add Idea
                  </button>
                )}
              </div>
              {shortlistItems.map`);

const closeRegex = /                  \}\)\n\s*\)\}\n\s*<\/div>\n\s*\) : \(\(\) => \{/;

content = content.replace(closeRegex, `                  })
              )}
            </div>
          )}
        </div>
      ) : (() => {`);

fs.writeFileSync('src/components/timeline/ItineraryTimeline.tsx', content);
