# Flow sa Website \- this need more details\!

# 

# Name:

# 

# \-Welcome

# \-Assessment

# \-Turn based Game (Still in earth doing basic astro things) \- timtim

# \-Graduation 

# \-Roles and Tradeoffs

# \-Moon or Mars

# \-Spaceship going to that Planet

# \-First Scenario (oxygen levels down) \- Applying the knowledge of the training

# \-Planet Landing

# \- MIssions in 30 days

# \- 2D, turnbased, among us type of tasks

# \- After 30 days, last assessment before going back to earth (if dili kapasar naay penalty bale 3-5 days extension)

# \-If napasar makauli ka sa earth, maghatagreport then evaluation, then recommendation on the next mission run

# \-ending

# 

# Specifications

# Characters and Roles:

# Spaceship Repairman

# Farmer

# Traveller/Scavenger

# Researcher/Evaluator

# Assessment Part:

# Which areas do we need to focus on being an astronaut?

# \-Machineries/Equipment

# \-Basic Astro Competency (moon walk etc)

# \-Farming 

# \-Travelling 

# \-Researcher

# \-Repair

# \-Basic reporting and communication

# 

# 

# Missions on each roles at least 3 to 5 each day per role in the 30 days trial:

# Day 1:

# 1

# 2

# 3

# Day 2:

# 

EXPEDITION 33: BASE COMMAND  
2026 NASA Space Apps Challenge \- "Junior Astro Trainer App"  
Game Mechanics & Timeline Flow Plan

\======================================================================  
1\. PROJECT GOAL & MAIN IDEA  
\======================================================================

Problem:  
Space educational games make astronaut engineering compromises too basic without drawbacks or way too complex like datasheets to keep students interested.

Solution:  
Turn-based 2D web app game where players complete Earth training before running a Moon or Mars station. Styled in 2D environments with turn-based mechanics, custom action cards, quick-time reaction prompts, and dialogue setup.

NASA Data Setup:  
Resource values, output levels, planet variables, and hazard stats are handled via dynamic settings ready to connect directly to official NASA data sources.

\======================================================================  
2\. THE FOUR SYSTEM CONFLICTS  
\======================================================================

Across the training run and planetary survival stages, every choice creates interconnected trade-offs across four critical base systems:

1\. POWER SUPPLY  
   \- Role: Generated via solar grids to keep habitat modules operational.  
   \- Drawback: Cleaning or fixing solar panels takes valuable crew hours and life support oxygen.

2\. LIFE SUPPORT (Air & Water Systems)  
   \- Role: Controls clean air and water recycling inside the base environment.  
   \- Drawback: Filtering air and purifying water drains heavy power from the main system.

3\. FARMING (Hydroponic Greenhouse)  
   \- Role: Yields food supplies for the team while helping scrub cabin air.  
   \- Drawback: Running grow lights and water pumps drains both power and water reserves.

4\. RADIATION SHIELDING & STRUCTURAL HULL  
   \- Role: Protects the team against space radiation, solar storms, and surface storms.  
   \- Drawback: Refilling liquid shield barriers and patching leaks burns power and water stores.

\======================================================================  
3\. COMPLETE GAME SEQUENCE FLOW  
\======================================================================

PHASE 1: Comic Introduction Storyboard  
\----------------------------------------------------------------------  
\- Story Opening: Starts with a comic book layout instead of standard menus.  
\- Click Progress: Each click loads the next styled panel with audio effects and dialogues:  
  \- Panel 1: Becoming an astronaut heading to Moon or Mars bases.  
  \- Panel 2: Showing why missions crash when power, life support, farming, and shielding clash.  
  \- Panel 3: Introducing the Earth Training Facility where astronauts handle trade-offs before launch.  
  \- Panel 4: Putting on the helmet to start training tasks.  
\- Screen Switch: Finishing the panel scene switches over to the Main Menu.

PHASE 2: Main Menu Setup  
\----------------------------------------------------------------------  
Set against a 2D deep space backdrop with menu option panels:

1\. START GAME (Locked Initially)  
   \- Clicking this first alerts players that Earth training is required before mission launch.  
   \- Unlocks completely once tutorial tasks are done, displaying user stats and perks.

2\. TRAINING (Active Option)  
   \- Begins the Earth simulator to learn turn-based game balance.

3\. OPTIONS  
   \- Adjust sound volume, modify QTE timing limits, or wipe current save files.

4\. ABOUT & CREDITS  
   \- Summary of project design, team roster, and NASA data source list.

PHASE 3: Mandatory Earth Simulator  
\----------------------------------------------------------------------  
\- 2D Facility Layout:  
  Loads an Earth analog dome environment mimicking space terrain with playable astronaut character sprite.

\- Turn Mechanics & Tasks:  
  \- Action Order Bar: Displays action turns along with upcoming simulation hazards.  
  \- Tactical Action Cards: Hovering displays previews of resource increases and drops before selection.  
  \- Quick-Time Reaction Prompts: Timing actions correctly grants bonus efficiency while lowering resource penalties.  
  \- Guided Tutorials: Flight leads guide players through initial scenarios covering Power, Oxygen, Water, and Shielding.

PHASE 4: Results & Evaluation Screen  
\----------------------------------------------------------------------  
\- Award Scene Transition:  
  Clearing training leads directly to an evaluation ceremony screen.  
\- Grade Score:  
  Ranks player execution (Rank S, A, B) based on stat management and QTE accuracy.  
\- Profile Save Data:  
  Stores performance perks for the main run and unlocks the main menu START option.

PHASE 5: Moon or Mars Main Expedition  
\----------------------------------------------------------------------  
Selecting the unlocked START button begins the space mission:

\- Role and Location Setup:  
  \- Pick a Specialist Class (Technician, Farmer, Shield Expert, Researcher) with specific traits.  
  \- Pick Location (Moon Base vs Mars Colony) with distinct environmental weather factors.  
  \- Applies saved bonus boosts from training directly to Day 1 gauges.

\- Base Map & Daily Turn Cycle:  
  \- 2D Base Layout: Map shows 5 key rooms (Solar Array, Life Support, Hydroponics, Shield Dome, Science Lab) with animated astronaut movement.  
  \- Daily Loop: Each day provides clear targets and action points to split across base stations.  
  \- Action Options: Selecting a room displays safe low-risk actions or risky boost choices.  
  \- Environment Events: Ending a turn consumes core daily supplies and triggers hazards like solar storms or dust clouds.  
  \- Flight Log Updates: Short text reports explain why status bars shifted after every cycle.

PHASE 6: Mission Summary & Certificate  
\----------------------------------------------------------------------  
\- Final Performance Check:  
  Evaluates if all critical system meters remained safe throughout the target timeline duration.  
\- Ending Report & Badges:  
  Displays mission outcome status, stats summary, unlocked achievement badges, and restart button for alternate runs.  
