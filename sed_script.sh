sed -i '297,299c\
  const handleCreateBrainstormTrip = async (e: React.FormEvent) => {\
    e.preventDefault();\
    if (!newDestination.trim()) {\
      setErrorMsg("Destination is required for brainstorming ideas.");\
      return;\
    }\
    try {' src/components/hub/TripHub.tsx
