# Atlas Travel Planner — Demo Recording
# Requires: brew install charmbracelet/tap/vhs
# Run: vhs demo.tape
# Note: Requires live API keys (.env) and internet — LLM responses are live

Output demo.gif
Set Shell "zsh"
Set FontSize 14
Set Width 1200
Set Height 800
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 50ms
Set PlaybackSpeed 0.5

# Start the app
Type "npm start 2>/dev/null"
Enter
Sleep 3s

# Phase 1: Gathering — provide trip details
Type "Hey! I want to plan a trip to Tokyo"
Enter
Sleep 8s

Type "Flying from Melbourne"
Enter
Sleep 5s

Type "April 10 to April 14, 2026"
Enter
Sleep 5s

Type "2 adults"
Enter
Sleep 5s

Type "Budget is around $5000 total. We love street food, temples, and cherry blossoms"
Enter
Sleep 45s

# Phase 2: Planning — wait for search results and top 5 options
# The agent searches flights, hotels, activities, weather, and events
# Then presents top 5 flight + hotel options for selection

Sleep 15s

# Phase 3: User selection
Type "Flight 2 and hotel 3"
Enter
Sleep 30s

# Wait for the full itinerary to be compiled and displayed
Sleep 15s

# Exit
Type "quit"
Enter
Sleep 2s
