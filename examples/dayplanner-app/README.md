# Funday 🗓️�

An AI-powered activity planning application that creates personalized day itineraries based on your preferences, location, weather, day of the week, local events, and real-time data.

## ✨ Features

- 🗺️ **Interactive location selection** with map or automatic geolocation
- 🎤 **Voice or text input** for natural activity requests
- 🌤️ **Weather-aware planning** with real-time forecasts
- � **Calendar-smart**: Knows when it's Sunday or a holiday, adjusts for closures
- 🎪 **Local event integration**: Discovers concerts, festivals, exhibitions (e.g., Tapahtumainfo.fi in Finland)
- 🌍 **Locale-aware**: Dynamically selects appropriate event sources based on your region
- �🚶‍♀️ **Multiple transport modes**: walking, cycling, public transit
- 🍽️ **Smart filtering**: cuisine types, ratings, dietary restrictions
- 🎯 **AI-optimized routes** that minimize travel time and respect event schedules
- 📱 **Card-based UI** with drag-and-drop reordering
- 💾 **Save and share** itineraries with calendar export

## 🏗️ Architecture

```
┌─────────────────┐      HTTPS       ┌──────────────────┐
│  React Frontend │ ◄───────────────► │  Backend API     │
│  (Map + Voice)  │                   │  (Node.js/       │
│                 │                   │   Express)       │
└─────────────────┘                   └──────────────────┘
                                               │
                           ┌───────────────────┼───────────────────┐
                           │                   │                   │
                    ┌──────▼───────┐  ┌────────▼──────┐  ┌────────▼─────────┐
                    │ Azure OpenAI │  │  Cosmos DB    │  │  Blob Storage   │
                    │   (GPT-4o)   │  │ (Itineraries) │  │  (Exports)      │
                    └──────────────┘  └───────────────┘  └─────────────────┘
                           │
                    ┌──────▼───────┐
                    │ External APIs│
                    │ • Weather    │
                    │ • Places     │
                    │ • Transit    │
                    │ • Events*    │
                    │ • Holidays   │
                    └──────────────┘
                    
                    * Dynamic by locale
                    (e.g., Tapahtumainfo.fi
                     for Finland)
```

**Deployment**: Azure Container Apps in **rg-ailz-lab**

## 🎯 Example Use Cases

### "Show me a relaxing day by the sea"
→ Funday generates: Beach walk → Seaside café → Swimming spot → Sunset viewpoint

### "Food tour of Asian cuisine, cycling, max 10km"
→ Funday generates: Thai restaurant → Vietnamese café → Korean BBQ (optimized cycling route)

### "Family day with kids, playgrounds and ice cream"
→ Funday generates: Park #1 → Ice cream shop → Park #2 → Picnic spot → Home via transit

### 🆕 "Find me something fun today" (on a Sunday)
→ Funday warns: "It's Sunday - many shops close early. I found a jazz festival starting at 3 PM!"  
→ Generates: Brunch → Nature walk → **Jazz Festival (3-7 PM)** → Dinner nearby

### 🆕 "Outdoor activities, but it might rain"
→ Funday checks weather: "Rain expected after 2 PM. Outdoor activities in morning, indoor backup ready."  
→ Generates: Morning hike → Café lunch → **Art Museum** (rain backup) → Indoor climbing gym

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Docker Desktop
- Azure CLI (authenticated to rg-ailz-lab)

### Local Development

```powershell
# Clone and navigate
cd c:\Users\mikkokallio\dev\simple-ai-lz\examples\dayplanner-app

# Start frontend
cd frontend
npm install
npm run dev

# Start backend (new terminal)
cd backend
npm install
npm run dev

# Or use Docker Compose
docker-compose up
```

Frontend: http://localhost:5173  
Backend: http://localhost:3000

## 📋 Project Status

**Status**: Requirements specification complete ✅

### Next Steps
1. Create frontend React app with map integration
2. Create backend API with Azure OpenAI integration
3. Set up Cosmos DB database and containers
4. Implement core itinerary generation with day-of-week logic
5. Add voice input with Azure Speech Services
6. Integrate external APIs (weather, places, transit, **events**, holidays)
7. Implement locale detection and dynamic event source selection

## 📚 Documentation

- **[REQUIREMENTS.md](./REQUIREMENTS.md)** - Complete requirements specification
- **DESIGN.md** - _(To be created)_ Architecture and design decisions
- **DEPLOYMENT.md** - _(To be created)_ Deployment guide for Azure
- **API.md** - _(To be created)_ Backend API documentation

## 🛠️ Technology Stack

### Frontend
- React 18 + TypeScript + Vite
- TailwindCSS for styling
- Leaflet or Mapbox for maps
- Azure Speech SDK for voice input

### Backend
- Node.js 20 + TypeScript
- Express.js REST API
- Azure OpenAI (GPT-4o with function calling)
- Azure Speech Services

### Azure Services (rg-ailz-lab)
- **Azure Container Apps** - Hosting frontend & backend
- **Cosmos DB** - Itinerary persistence
- **Blob Storage** - Exports and cached data
- **Azure OpenAI** - AI-powered planning
- **Azure Speech Services** - Voice-to-text

### External APIs
- Open-Meteo (weather, free)
- Google Places API or Overpass API (POI data)
- Local transit APIs (region-specific)
- **Event APIs** (locale-aware):
  - Finland: Tapahtumainfo.fi
  - Generic: Eventbrite, Meetup
- Nager.Date API (holidays)

## 🎨 UI Concept

### Main Interface
```
┌─────────────────────────────────────────────┐
│  📍 Starting Location: [Your Location ▼]   │
│  ┌──────────────────────────────────────┐  │
│  │        [Interactive Map View]        │  │
│  │     • Starting point marker          │  │
│  │     • Radius circle overlay          │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  🎤 "Tell me what you'd like to do today"  │
│  ┌──────────────────────────────────────┐  │
│  │ [Voice Input] or [Text Input]        │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  🚶 Transport: [Walk] [Bike] [Transit]     │
│  📏 Radius: [●────────] 5 km               │
│                                             │
│  [Generate Itinerary] 🎯                   │
└─────────────────────────────────────────────┘
```

### Itinerary Result
```
┌──────────────────── Your Day Plan ────────────────────┐
│  🌤️ Sunny, 22°C  |  📍 10km total  |  ⏱️ 6 hours      │
├───────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐  │
│  │ 1️⃣ 🚶 Walk to Waterfront Park                   │  │
│  │    📍 2.3 km • 28 min                           │  │
│  │    Start your day with scenic lakeside views   │  │
│  │    ☀️ Perfect weather! • Open till 9 PM        │  │
│  │    [📍 Navigate] [✏️ Edit] [🗑️ Remove]          │  │
│  └─────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 2️⃣ 🍽️ Lunch at Seaside Bistro                   │  │
│  │    ⭐ 4.5 • $$ • Mediterranean                  │  │
│  │    📍 0.5 km • 6 min walk from previous        │  │
│  │    ⚠️ Closes at 3 PM today (Sunday)            │  │
│  │    [📞 Call] [🌐 Website] [✏️ Edit]             │  │
│  └─────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 3️⃣ 🏖️ Swimming at Beach Point                   │  │
│  │    📍 1.8 km • 22 min walk                      │  │
│  │    Perfect weather for a swim!                  │  │
│  └─────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 4️⃣ 🎪 Summer Music Festival                     │  │
│  │    🎵 Starts at 5 PM • Free entry               │  │
│  │    📍 1.2 km • 15 min walk                      │  │
│  │    [🎟️ Event Info] [✏️ Edit]                    │  │
│  └─────────────────────────────────────────────────┘  │
│  ...                                                  │
│  [Save Plan] [Export] [Modify Route] [Start Over]    │
└───────────────────────────────────────────────────────┘
```

## 🧪 Testing

```powershell
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

## 🚀 Deployment

Deploy to Azure Container Apps in rg-ailz-lab:

```powershell
# Build and push images
cd infrastructure
./deploy.ps1
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

## 🤝 Contributing

This is a demo application for the Azure AI Landing Zone. Follow existing patterns from other apps in the `examples/` directory.

## 📄 License

Internal Microsoft demo application.

---

**Version**: 0.1.0 (Requirements Phase)  
**Created**: November 15, 2025
