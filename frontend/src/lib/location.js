/**
 * Automatically detects current browser geolocation and reverse-geocodes it
 * into address fields (street address, landmark, city, state, pincode).
 */
export async function detectCurrentLocation() {
  if (typeof window === "undefined" || !navigator.geolocation) {
    throw new Error("Geolocation is not supported by your browser");
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        let detected = {
          address: "",
          landmark: "",
          city: "",
          state: "",
          pincode: "",
        };

        // Try OpenStreetMap Nominatim reverse geocode first
        try {
          const nomRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
            { headers: { "Accept-Language": "en" } }
          );
          if (nomRes.ok) {
            const nom = await nomRes.json();
            const a = nom.address || {};
            const road = [a.house_number, a.road, a.residential || a.suburb]
              .filter(Boolean)
              .join(", ");
            const landmark =
              a.landmark ||
              a.neighbourhood ||
              a.amenity ||
              a.building ||
              a.suburb ||
              "";
            const city =
              a.city ||
              a.town ||
              a.village ||
              a.county ||
              a.state_district ||
              "";
            const state = a.state || "";
            const rawPostcode = (a.postcode || "").replace(/\D/g, "").slice(0, 6);

            detected = {
              address: road || nom.display_name?.split(",")?.slice(0, 2)?.join(",") || "",
              landmark: landmark,
              city: city,
              state: state,
              pincode: rawPostcode,
              lat: latitude,
              lng: longitude,
            };

            if (detected.city || detected.pincode) {
              return resolve(detected);
            }
          }
        } catch {
          // Fall through to backup
        }

        // Backup: BigDataCloud Client Reverse Geocode API
        try {
          const bdcRes = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
          );
          if (bdcRes.ok) {
            const bdc = await bdcRes.json();
            const city = bdc.city || bdc.locality || "";
            const state = bdc.principalSubdivision || "";
            const pincode = (bdc.postcode || "").replace(/\D/g, "").slice(0, 6);
            const landmark = bdc.locality || bdc.lookupSource || "";
            const address = [bdc.locality, bdc.city].filter(Boolean).join(", ");

            return resolve({
              address: address || detected.address,
              landmark: landmark || detected.landmark,
              city: city || detected.city,
              state: state || detected.state,
              pincode: pincode || detected.pincode,
              lat: latitude,
              lng: longitude,
            });
          }
        } catch {
          // Fall through
        }

        resolve({
          ...detected,
          lat: latitude,
          lng: longitude,
        });
      },
      (error) => {
        let msg = "Location detection failed";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "Location permission was denied. Please allow location access or fill details manually.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = "Location position is currently unavailable.";
        } else if (error.code === error.TIMEOUT) {
          msg = "Location detection request timed out.";
        }
        reject(new Error(msg));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  });
}

/**
 * Checks if a given location or address is in Jamshedpur or surrounding areas
 * (e.g. Adityapur, Gamharia, Sakchi, Bistupur, Kadma, Sonari, Mango, Telco, Jugsalai, etc.).
 */
export function isJamshedpurOrSurrounding(loc) {
  if (!loc) return false;

  // 1. Coordinate check (within ~40km of Jamshedpur center ~22.805, 86.203)
  if (typeof loc.lat === "number" && typeof loc.lng === "number") {
    const dLat = loc.lat - 22.8046;
    const dLng = loc.lng - 86.2029;
    if (dLat * dLat + dLng * dLng <= 0.16) {
      return true;
    }
  }

  // 2. Pincode check: Jamshedpur urban (831xxx) and Adityapur/Gamharia corridor (8321xx / 8323xx)
  const pin = (loc.pincode || "").toString().trim().replace(/\D/g, "");
  if (pin.startsWith("831") || pin.startsWith("8321") || pin.startsWith("8323")) {
    return true;
  }

  // 3. Text check across address, landmark, city, and state
  const text = `${loc.city || ""} ${loc.landmark || ""} ${loc.address || ""} ${loc.state || ""}`.toLowerCase();
  const keywords = [
    "jamshedpur",
    "tatanagar",
    "adityapur",
    "gamharia",
    "gamaria",
    "sakchi",
    "bistupur",
    "bishtupur",
    "kadma",
    "sonari",
    "mango",
    "telco",
    "jugsalai",
    "golmuri",
    "burmamines",
    "baridih",
    "bagbera",
    "parsudih",
    "sidhgora",
    "govindpur",
    "sundernagar",
    "agrico",
    "kandra",
    "singhbhum",
  ];

  return keywords.some((kw) => text.includes(kw));
}

