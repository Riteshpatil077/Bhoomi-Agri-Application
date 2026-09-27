import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "../context/AuthContext";

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिन्दी" },
  { value: "mr", label: "मराठी" },
  { value: "pa", label: "ਪੰਜਾਬੀ" },
  { value: "te", label: "తెలుగు" },
  { value: "ta", label: "தமிழ்" },
  { value: "bn", label: "বাংলা" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["value"];
type Catalog = Record<string, string>;
type LanguageContextValue = {
  language: LanguageCode;
  setLanguage: (language: string) => void;
  t: (englishText: string) => string;
};

const STORAGE_KEY = "bhoomi_language_v2";
const supported = new Set<string>(LANGUAGES.map((item) => item.value));

const catalogs: Partial<Record<LanguageCode, Catalog>> = {
  hi: {
    "Your agriculture companion": "आपका कृषि साथी", "Language / भाषा": "भाषा",
    "Phone number or email": "फ़ोन नंबर या ईमेल", "Enter your phone or email": "अपना फ़ोन नंबर या ईमेल दर्ज करें",
    Password: "पासवर्ड", "Enter your password": "अपना पासवर्ड दर्ज करें", "Sign in": "साइन इन करें",
    "Signing in…": "साइन इन हो रहा है…", "Don't have an account?": "खाता नहीं है?", "Create account": "खाता बनाएँ",
    "Hide password": "पासवर्ड छिपाएँ", "Show password": "पासवर्ड दिखाएँ", "Phone number or email is required.": "फ़ोन नंबर या ईमेल ज़रूरी है।",
    "Password is required.": "पासवर्ड ज़रूरी है।", "Password must be at least 6 characters.": "पासवर्ड कम से कम 6 अक्षरों का होना चाहिए।",
    "Create your account": "अपना खाता बनाएँ", "Account created!": "खाता बन गया!", "Full name": "पूरा नाम",
    "Your full name": "अपना पूरा नाम दर्ज करें", "Phone number": "फ़ोन नंबर", "Email address": "ईमेल पता",
    "I am a…": "मैं हूँ…", "Select role (optional)": "भूमिका चुनें (वैकल्पिक)", Farmer: "किसान",
    Buyer: "खरीदार", "Agricultural Expert": "कृषि विशेषज्ञ", "Service Provider": "सेवा प्रदाता",
    "Confirm password": "पासवर्ड की पुष्टि करें", "Create a password": "पासवर्ड बनाएँ",
    "Repeat your password": "पासवर्ड दोबारा दर्ज करें",
    "Creating account…": "खाता बनाया जा रहा है…", "Already have an account?": "पहले से खाता है?",
    "Sign in now": "अभी साइन इन करें", "Welcome to Bhoomi. Sign in to get started.": "Bhoomi में आपका स्वागत है। शुरू करने के लिए साइन इन करें।",
    Dashboard: "डैशबोर्ड", "My Farms": "मेरे खेत", "Crop Cycles": "फसल चक्र", Activities: "गतिविधियाँ",
    "Weather & Advisory": "मौसम और सलाह", "Farmer Verification": "किसान सत्यापन", "Farm Management": "खेत प्रबंधन",
    Administration: "प्रशासन", "Admin Portal": "एडमिन पोर्टल", "Super Admin": "सुपर एडमिन",
    "System & Tools": "सिस्टम और टूल", "My Profile": "मेरी प्रोफ़ाइल", "Design System Guide": "डिज़ाइन सिस्टम गाइड",
    "Sign Out": "साइन आउट", Home: "होम", Farms: "खेत", Weather: "मौसम", More: "और", Profile: "प्रोफ़ाइल",
    "Start by creating a farm, adding a plot, and logging your first sowing.": "शुरुआत के लिए खेत बनाएँ, प्लॉट जोड़ें और पहली बुवाई दर्ज करें।",
    "Add a plot to get started": "शुरू करने के लिए प्लॉट जोड़ें", "Log your first sowing on this plot.": "इस प्लॉट पर पहली बुवाई दर्ज करें।",
    "Cannot reach the server. Check your connection and try again.": "सर्वर से संपर्क नहीं हो पा रहा। अपना कनेक्शन जाँचकर फिर प्रयास करें।",
    "Full name is required.": "पूरा नाम ज़रूरी है।", "Full name must be at least 2 characters.": "पूरा नाम कम से कम २ अक्षरों का होना चाहिए।",
    "Phone number is required.": "फ़ोन नंबर ज़रूरी है।", "Enter a valid phone number (8–15 digits).": "सही फ़ोन नंबर दर्ज करें (८–१५ अंक)।",
    "Email address is required.": "ईमेल पता ज़रूरी है।", "Enter a valid email address.": "सही ईमेल पता दर्ज करें।",
    "Password must be at least 8 characters.": "पासवर्ड कम से कम ८ अक्षरों का होना चाहिए।", "Please confirm your password.": "कृपया पासवर्ड की पुष्टि करें।",
    "Passwords do not match.": "पासवर्ड मेल नहीं खाते।", "At least 8 characters.": "कम से कम ८ अक्षर।",
    "Used to log in. Enter with country code (e.g. +91).": "लॉगिन के लिए उपयोग होगा। देश कोड के साथ दर्ज करें (जैसे +91)।",
    "Optional — you can set this later.": "वैकल्पिक — इसे बाद में चुन सकते हैं।", "Preferred language": "पसंदीदा भाषा",
    Welcome: "स्वागत है", "Verified Farmer": "सत्यापित किसान", "Verification Pending": "सत्यापन लंबित", "Verification Needed": "सत्यापन आवश्यक",
    Role: "भूमिका", Namaste: "नमस्ते", "Here is what needs attention across your agricultural holdings today.": "आज आपकी खेती में जिन बातों पर ध्यान देना है, उनका सारांश यहाँ है।",
    "Complete Verification": "सत्यापन पूरा करें", "Log Activity": "गतिविधि दर्ज करें", "Loading...": "लोड हो रहा है…",
    "1 registered farm": "१ पंजीकृत खेत", "{count} registered farms": "{count} पंजीकृत खेत", "Tasks Due Today": "आज के कार्य",
    "View all activities": "सभी गतिविधियाँ देखें", "Main Navigation": "मुख्य नेविगेशन", "Agri Platform": "कृषि मंच",
    Verified: "सत्यापित", Pending: "लंबित", Governance: "प्रशासन",
    "Your profile": "आपकी प्रोफ़ाइल", "Your profile — loading": "आपकी प्रोफ़ाइल लोड हो रही है",
    "Account info": "खाते की जानकारी", Phone: "फ़ोन", Email: "ईमेल", Language: "भाषा", Verification: "सत्यापन",
    "Edit profile": "प्रोफ़ाइल संपादित करें", "Edit name & language": "नाम और भाषा बदलें", "Saving…": "सहेजा जा रहा है…",
    "Save changes": "बदलाव सहेजें", Cancel: "रद्द करें", "Change password": "पासवर्ड बदलें", "Update password": "पासवर्ड अपडेट करें",
    Sessions: "सत्र", "Sign out all devices": "सभी डिवाइस से साइन आउट करें", "My Agricultural Farms": "मेरे कृषि खेत",
    "Manage your land holdings, register boundary plots, and track agricultural cycles.": "अपनी भूमि और खेतों का प्रबंधन करें और खेती का रिकॉर्ड रखें।",
    "Add New Farm": "नया खेत जोड़ें", "No Farms Registered Yet": "अभी कोई खेत पंजीकृत नहीं है", "Add Your First Farm": "अपना पहला खेत जोड़ें",
    "Register New Farm": "नया खेत पंजीकृत करें", "Edit Farm Details": "खेत का विवरण संपादित करें", "Farm Name": "खेत का नाम",
    "E.g. Greenfield Valley, East Acre Estate": "उदाहरण: हरित खेत", "Enter farm name": "खेत का नाम दर्ज करें", "Farm location": "खेत का स्थान",
    "Use GPS or enter your village, town, or address.": "GPS का उपयोग करें या गाँव, शहर अथवा पता दर्ज करें।", "Soil type": "मिट्टी का प्रकार", optional: "वैकल्पिक",
    "No Plots in this Farm Yet": "इस खेत में अभी कोई प्लॉट नहीं है",
  },
  mr: {
    "Your agriculture companion": "तुमचा शेतीमधील साथीदार", "Language / भाषा": "भाषा",
    "Phone number or email": "फोन नंबर किंवा ईमेल", "Enter your phone or email": "फोन नंबर किंवा ईमेल टाका",
    Password: "पासवर्ड", "Enter your password": "तुमचा पासवर्ड टाका", "Sign in": "साइन इन करा",
    "Signing in…": "साइन इन होत आहे…", "Don't have an account?": "खाते नाही?", "Create account": "खाते तयार करा",
    "Hide password": "पासवर्ड लपवा", "Show password": "पासवर्ड दाखवा", "Phone number or email is required.": "फोन नंबर किंवा ईमेल आवश्यक आहे.",
    "Password is required.": "पासवर्ड आवश्यक आहे.", "Password must be at least 6 characters.": "पासवर्ड किमान ६ अक्षरांचा असावा.",
    "Create your account": "तुमचे खाते तयार करा", "Account created!": "खाते तयार झाले!", "Full name": "पूर्ण नाव",
    "Your full name": "तुमचे पूर्ण नाव टाका", "Phone number": "फोन नंबर", "Email address": "ईमेल पत्ता",
    "I am a…": "मी आहे…", "Select role (optional)": "भूमिका निवडा (ऐच्छिक)", Farmer: "शेतकरी",
    Buyer: "खरेदीदार", "Agricultural Expert": "कृषी तज्ज्ञ", "Service Provider": "सेवा पुरवठादार",
    "Confirm password": "पासवर्डची पुष्टी करा", "Create a password": "पासवर्ड तयार करा", "Repeat your password": "पासवर्ड पुन्हा टाका",
    "Creating account…": "खाते तयार होत आहे…", "Already have an account?": "आधीच खाते आहे?", "Sign in now": "आता साइन इन करा",
    "Welcome to Bhoomi. Sign in to get started.": "Bhoomi मध्ये स्वागत आहे. सुरुवात करण्यासाठी साइन इन करा.",
    Dashboard: "डॅशबोर्ड", "My Farms": "माझी शेती", "Crop Cycles": "पीक चक्र", Activities: "कामे",
    "Weather & Advisory": "हवामान आणि सल्ला", "Farmer Verification": "शेतकरी पडताळणी", "Farm Management": "शेती व्यवस्थापन",
    Administration: "प्रशासन", "Admin Portal": "अॅडमिन पोर्टल", "Super Admin": "सुपर अॅडमिन",
    "System & Tools": "सिस्टम आणि साधने", "My Profile": "माझी प्रोफाइल", "Design System Guide": "डिझाइन सिस्टम मार्गदर्शक",
    "Sign Out": "साइन आउट", Home: "मुख्यपृष्ठ", Farms: "शेती", Weather: "हवामान", More: "अधिक", Profile: "प्रोफाइल",
    "Start by creating a farm, adding a plot, and logging your first sowing.": "शेत तयार करा, प्लॉट जोडा आणि पहिली पेरणी नोंदवून सुरुवात करा.",
    "Add a plot to get started": "सुरू करण्यासाठी प्लॉट जोडा", "Log your first sowing on this plot.": "या प्लॉटवर पहिली पेरणी नोंदवा.",
    "Cannot reach the server. Check your connection and try again.": "सर्व्हरशी संपर्क होत नाही. तुमचे इंटरनेट तपासून पुन्हा प्रयत्न करा.",
    "Full name is required.": "पूर्ण नाव आवश्यक आहे.", "Full name must be at least 2 characters.": "पूर्ण नाव किमान २ अक्षरांचे असावे.",
    "Phone number is required.": "फोन नंबर आवश्यक आहे.", "Enter a valid phone number (8–15 digits).": "वैध फोन नंबर टाका (८–१५ अंक).",
    "Email address is required.": "ईमेल पत्ता आवश्यक आहे.", "Enter a valid email address.": "वैध ईमेल पत्ता टाका.",
    "Password must be at least 8 characters.": "पासवर्ड किमान ८ अक्षरांचा असावा.", "Please confirm your password.": "पासवर्डची पुष्टी करा.",
    "Passwords do not match.": "पासवर्ड जुळत नाहीत.", "At least 8 characters.": "किमान ८ अक्षरे.",
    "Used to log in. Enter with country code (e.g. +91).": "लॉगिनसाठी वापरला जाईल. देश कोडसह टाका (उदा. +91).",
    "Optional — you can set this later.": "ऐच्छिक — हे नंतर निवडता येईल.", "Preferred language": "पसंतीची भाषा",
    Welcome: "स्वागत", "Verified Farmer": "पडताळलेला शेतकरी", "Verification Pending": "पडताळणी प्रलंबित", "Verification Needed": "पडताळणी आवश्यक",
    Role: "भूमिका", Namaste: "नमस्कार", "Here is what needs attention across your agricultural holdings today.": "आज तुमच्या शेतीतील महत्त्वाच्या गोष्टींचा आढावा.",
    "Complete Verification": "पडताळणी पूर्ण करा", "Log Activity": "कामाची नोंद करा", "Loading...": "लोड होत आहे…",
    "1 registered farm": "१ नोंदणीकृत शेत", "{count} registered farms": "{count} नोंदणीकृत शेते", "Tasks Due Today": "आजची कामे",
    "View all activities": "सर्व कामे पहा", "Main Navigation": "मुख्य नेव्हिगेशन", "Agri Platform": "कृषी व्यासपीठ",
    Verified: "पडताळलेले", Pending: "प्रलंबित", Governance: "प्रशासन",
    "Your profile": "तुमची प्रोफाइल", "Your profile — loading": "तुमची प्रोफाइल लोड होत आहे",
    "Account info": "खात्याची माहिती", Phone: "फोन", Email: "ईमेल", Language: "भाषा", Verification: "पडताळणी",
    "Edit profile": "प्रोफाइल संपादित करा", "Edit name & language": "नाव आणि भाषा बदला", "Saving…": "जतन होत आहे…",
    "Save changes": "बदल जतन करा", Cancel: "रद्द करा", "Change password": "पासवर्ड बदला", "Update password": "पासवर्ड अपडेट करा",
    Sessions: "सत्रे", "Sign out all devices": "सर्व उपकरणांमधून साइन आउट करा", "My Agricultural Farms": "माझी शेती",
    "Manage your land holdings, register boundary plots, and track agricultural cycles.": "तुमच्या जमिनीचे व्यवस्थापन करा आणि शेतीची नोंद ठेवा.",
    "Add New Farm": "नवीन शेत जोडा", "No Farms Registered Yet": "अद्याप शेत नोंदवलेले नाही", "Add Your First Farm": "तुमचे पहिले शेत जोडा",
    "Register New Farm": "नवीन शेत नोंदवा", "Edit Farm Details": "शेताची माहिती संपादित करा", "Farm Name": "शेताचे नाव",
    "E.g. Greenfield Valley, East Acre Estate": "उदा. हिरवे शिवार", "Enter farm name": "शेताचे नाव टाका", "Farm location": "शेताचे ठिकाण",
    "Use GPS or enter your village, town, or address.": "GPS वापरा किंवा गाव, शहर अथवा पत्ता टाका.", "Soil type": "मातीचा प्रकार", optional: "ऐच्छिक",
    "No Plots in this Farm Yet": "या शेतात अजून प्लॉट नाहीत",
  },
  pa: {
    "Your agriculture companion": "ਤੁਹਾਡਾ ਖੇਤੀਬਾੜੀ ਸਾਥੀ", "Language / भाषा": "ਭਾਸ਼ਾ",
    "Phone number or email": "ਫ਼ੋਨ ਨੰਬਰ ਜਾਂ ਈਮੇਲ", "Enter your phone or email": "ਆਪਣਾ ਫ਼ੋਨ ਨੰਬਰ ਜਾਂ ਈਮੇਲ ਦਾਖ਼ਲ ਕਰੋ",
    Password: "ਪਾਸਵਰਡ", "Enter your password": "ਆਪਣਾ ਪਾਸਵਰਡ ਦਾਖ਼ਲ ਕਰੋ", "Sign in": "ਸਾਈਨ ਇਨ ਕਰੋ",
    "Signing in…": "ਸਾਈਨ ਇਨ ਹੋ ਰਿਹਾ ਹੈ…", "Don't have an account?": "ਖਾਤਾ ਨਹੀਂ ਹੈ?", "Create account": "ਖਾਤਾ ਬਣਾਓ",
    "Hide password": "ਪਾਸਵਰਡ ਲੁਕਾਓ", "Show password": "ਪਾਸਵਰਡ ਦਿਖਾਓ", "Phone number or email is required.": "ਫ਼ੋਨ ਨੰਬਰ ਜਾਂ ਈਮੇਲ ਲਾਜ਼ਮੀ ਹੈ।",
    "Password is required.": "ਪਾਸਵਰਡ ਲਾਜ਼ਮੀ ਹੈ।", "Create your account": "ਆਪਣਾ ਖਾਤਾ ਬਣਾਓ", "Account created!": "ਖਾਤਾ ਬਣ ਗਿਆ!",
    "Full name": "ਪੂਰਾ ਨਾਮ", "Your full name": "ਆਪਣਾ ਪੂਰਾ ਨਾਮ ਦਾਖ਼ਲ ਕਰੋ", "Phone number": "ਫ਼ੋਨ ਨੰਬਰ", "Email address": "ਈਮੇਲ ਪਤਾ",
    "I am a…": "ਮੈਂ ਹਾਂ…", "Select role (optional)": "ਭੂਮਿਕਾ ਚੁਣੋ (ਵਿਕਲਪਿਕ)", Farmer: "ਕਿਸਾਨ", Buyer: "ਖਰੀਦਦਾਰ",
    "Agricultural Expert": "ਖੇਤੀ ਮਾਹਰ", "Service Provider": "ਸੇਵਾ ਪ੍ਰਦਾਤਾ", "Confirm password": "ਪਾਸਵਰਡ ਦੀ ਪੁਸ਼ਟੀ ਕਰੋ",
    "Create a password": "ਪਾਸਵਰਡ ਬਣਾਓ", "Repeat your password": "ਪਾਸਵਰਡ ਦੁਬਾਰਾ ਲਿਖੋ", "Creating account…": "ਖਾਤਾ ਬਣਾਇਆ ਜਾ ਰਿਹਾ ਹੈ…",
    "Already have an account?": "ਪਹਿਲਾਂ ਤੋਂ ਖਾਤਾ ਹੈ?", "Sign in now": "ਹੁਣੇ ਸਾਈਨ ਇਨ ਕਰੋ",
    Dashboard: "ਡੈਸ਼ਬੋਰਡ", "My Farms": "ਮੇਰੇ ਖੇਤ", "Crop Cycles": "ਫ਼ਸਲ ਚੱਕਰ", Activities: "ਗਤੀਵਿਧੀਆਂ",
    "Weather & Advisory": "ਮੌਸਮ ਅਤੇ ਸਲਾਹ", "Farmer Verification": "ਕਿਸਾਨ ਤਸਦੀਕ", "Farm Management": "ਖੇਤੀ ਪ੍ਰਬੰਧਨ",
    Administration: "ਪ੍ਰਸ਼ਾਸਨ", "Admin Portal": "ਐਡਮਿਨ ਪੋਰਟਲ", "Super Admin": "ਸੁਪਰ ਐਡਮਿਨ", "System & Tools": "ਸਿਸਟਮ ਅਤੇ ਸਾਧਨ",
    "My Profile": "ਮੇਰੀ ਪ੍ਰੋਫ਼ਾਈਲ", "Sign Out": "ਸਾਈਨ ਆਉਟ", Home: "ਮੁੱਖ", Farms: "ਖੇਤ", Weather: "ਮੌਸਮ", More: "ਹੋਰ", Profile: "ਪ੍ਰੋਫ਼ਾਈਲ",
    "Preferred language": "ਪਸੰਦੀਦਾ ਭਾਸ਼ਾ", Welcome: "ਜੀ ਆਇਆਂ ਨੂੰ", Role: "ਭੂਮਿਕਾ", Namaste: "ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ",
    "Complete Verification": "ਤਸਦੀਕ ਪੂਰੀ ਕਰੋ", "Log Activity": "ਗਤੀਵਿਧੀ ਦਰਜ ਕਰੋ", "Tasks Due Today": "ਅੱਜ ਦੇ ਕੰਮ",
    "View all activities": "ਸਾਰੀਆਂ ਗਤੀਵਿਧੀਆਂ ਵੇਖੋ", "Main Navigation": "ਮੁੱਖ ਨੈਵੀਗੇਸ਼ਨ", "Agri Platform": "ਖੇਤੀਬਾੜੀ ਪਲੇਟਫਾਰਮ",
    Verified: "ਤਸਦੀਕਸ਼ੁਦਾ", Pending: "ਬਕਾਇਆ", Governance: "ਪ੍ਰਸ਼ਾਸਨ",
    "Your profile": "ਤੁਹਾਡੀ ਪ੍ਰੋਫ਼ਾਈਲ", "Account info": "ਖਾਤੇ ਦੀ ਜਾਣਕਾਰੀ", Phone: "ਫ਼ੋਨ", Email: "ਈਮੇਲ",
    Language: "ਭਾਸ਼ਾ", Verification: "ਤਸਦੀਕ", "Edit profile": "ਪ੍ਰੋਫ਼ਾਈਲ ਸੋਧੋ", "Edit name & language": "ਨਾਮ ਅਤੇ ਭਾਸ਼ਾ ਬਦਲੋ",
    "Saving…": "ਸੁਰੱਖਿਅਤ ਹੋ ਰਿਹਾ ਹੈ…", "Save changes": "ਤਬਦੀਲੀਆਂ ਸੁਰੱਖਿਅਤ ਕਰੋ", Cancel: "ਰੱਦ ਕਰੋ",
    "Change password": "ਪਾਸਵਰਡ ਬਦਲੋ", "Update password": "ਪਾਸਵਰਡ ਅੱਪਡੇਟ ਕਰੋ", Sessions: "ਸੈਸ਼ਨ", "Sign out all devices": "ਸਾਰੇ ਡਿਵਾਈਸਾਂ ਤੋਂ ਸਾਈਨ ਆਉਟ ਕਰੋ",
    "Add New Farm": "ਨਵਾਂ ਖੇਤ ਜੋੜੋ", "No Farms Registered Yet": "ਹਾਲੇ ਕੋਈ ਖੇਤ ਦਰਜ ਨਹੀਂ", "Add Your First Farm": "ਆਪਣਾ ਪਹਿਲਾ ਖੇਤ ਜੋੜੋ",
    "Farm Name": "ਖੇਤ ਦਾ ਨਾਮ", "Farm location": "ਖੇਤ ਦਾ ਟਿਕਾਣਾ", "Soil type": "ਮਿੱਟੀ ਦੀ ਕਿਸਮ", optional: "ਵਿਕਲਪਿਕ",
    "No Plots in this Farm Yet": "ਇਸ ਖੇਤ ਵਿੱਚ ਹਾਲੇ ਪਲਾਟ ਨਹੀਂ ਹਨ",
  },
  te: {
    "Your agriculture companion": "మీ వ్యవసాయ సహచరుడు", "Language / भाषा": "భాష",
    "Phone number or email": "ఫోన్ నంబర్ లేదా ఇమెయిల్", "Enter your phone or email": "మీ ఫోన్ నంబర్ లేదా ఇమెయిల్ నమోదు చేయండి",
    Password: "పాస్‌వర్డ్", "Enter your password": "మీ పాస్‌వర్డ్ నమోదు చేయండి", "Sign in": "సైన్ ఇన్",
    "Signing in…": "సైన్ ఇన్ అవుతోంది…", "Don't have an account?": "ఖాతా లేదా?", "Create account": "ఖాతా సృష్టించండి",
    "Hide password": "పాస్‌వర్డ్ దాచు", "Show password": "పాస్‌వర్డ్ చూపు", "Phone number or email is required.": "ఫోన్ నంబర్ లేదా ఇమెయిల్ అవసరం.",
    "Password is required.": "పాస్‌వర్డ్ అవసరం.", "Create your account": "మీ ఖాతాను సృష్టించండి", "Account created!": "ఖాతా సృష్టించబడింది!",
    "Full name": "పూర్తి పేరు", "Your full name": "మీ పూర్తి పేరు నమోదు చేయండి", "Phone number": "ఫోన్ నంబర్", "Email address": "ఇమెయిల్ చిరునామా",
    "I am a…": "నేను…", "Select role (optional)": "పాత్ర ఎంచుకోండి (ఐచ్ఛికం)", Farmer: "రైతు", Buyer: "కొనుగోలుదారు",
    "Agricultural Expert": "వ్యవసాయ నిపుణుడు", "Service Provider": "సేవా ప్రదాత", "Confirm password": "పాస్‌వర్డ్ నిర్ధారించండి",
    "Create a password": "పాస్‌వర్డ్ సృష్టించండి", "Repeat your password": "పాస్‌వర్డ్ మళ్లీ నమోదు చేయండి", "Creating account…": "ఖాతా సృష్టిస్తోంది…",
    "Already have an account?": "ఇప్పటికే ఖాతా ఉందా?", "Sign in now": "ఇప్పుడే సైన్ ఇన్ చేయండి",
    Dashboard: "డ్యాష్‌బోర్డ్", "My Farms": "నా పొలాలు", "Crop Cycles": "పంట చక్రాలు", Activities: "కార్యకలాపాలు",
    "Weather & Advisory": "వాతావరణం మరియు సలహాలు", "Farmer Verification": "రైతు ధృవీకరణ", "Farm Management": "వ్యవసాయ నిర్వహణ",
    Administration: "పరిపాలన", "Admin Portal": "అడ్మిన్ పోర్టల్", "Super Admin": "సూపర్ అడ్మిన్", "System & Tools": "వ్యవస్థ మరియు సాధనాలు",
    "My Profile": "నా ప్రొఫైల్", "Sign Out": "సైన్ అవుట్", Home: "హోమ్", Farms: "పొలాలు", Weather: "వాతావరణం", More: "మరిన్ని", Profile: "ప్రొఫైల్",
    "Preferred language": "ఇష్టమైన భాష", Welcome: "స్వాగతం", Role: "పాత్ర", Namaste: "నమస్తే",
    "Complete Verification": "ధృవీకరణ పూర్తి చేయండి", "Log Activity": "కార్యకలాపాన్ని నమోదు చేయండి", "Tasks Due Today": "నేటి పనులు",
    "View all activities": "అన్ని కార్యకలాపాలు చూడండి", "Main Navigation": "ప్రధాన నావిగేషన్", "Agri Platform": "వ్యవసాయ వేదిక",
    Verified: "ధృవీకరించబడింది", Pending: "పెండింగ్", Governance: "పరిపాలన",
    "Your profile": "మీ ప్రొఫైల్", "Account info": "ఖాతా సమాచారం", Phone: "ఫోన్", Email: "ఇమెయిల్", Language: "భాష",
    Verification: "ధృవీకరణ", "Edit profile": "ప్రొఫైల్ సవరించండి", "Edit name & language": "పేరు మరియు భాష మార్చండి",
    "Saving…": "భద్రపరుస్తోంది…", "Save changes": "మార్పులను భద్రపరచండి", Cancel: "రద్దు చేయండి",
    "Change password": "పాస్‌వర్డ్ మార్చండి", "Update password": "పాస్‌వర్డ్ నవీకరించండి", Sessions: "సెషన్‌లు", "Sign out all devices": "అన్ని పరికరాల నుంచి సైన్ అవుట్",
    "Add New Farm": "కొత్త పొలం జోడించండి", "No Farms Registered Yet": "ఇంకా పొలాలు నమోదు కాలేదు", "Add Your First Farm": "మీ మొదటి పొలం జోడించండి",
    "Farm Name": "పొలం పేరు", "Farm location": "పొలం స్థానం", "Soil type": "నేల రకం", optional: "ఐచ్ఛికం",
    "No Plots in this Farm Yet": "ఈ పొలంలో ఇంకా ప్లాట్లు లేవు",
  },
  ta: {
    "Your agriculture companion": "உங்கள் விவசாயத் துணைவர்", "Language / भाषा": "மொழி",
    "Phone number or email": "தொலைபேசி எண் அல்லது மின்னஞ்சல்", "Enter your phone or email": "தொலைபேசி எண் அல்லது மின்னஞ்சலை உள்ளிடவும்",
    Password: "கடவுச்சொல்", "Enter your password": "கடவுச்சொல்லை உள்ளிடவும்", "Sign in": "உள்நுழைக",
    "Signing in…": "உள்நுழைகிறது…", "Don't have an account?": "கணக்கு இல்லையா?", "Create account": "கணக்கை உருவாக்கு",
    "Hide password": "கடவுச்சொல்லை மறை", "Show password": "கடவுச்சொல்லைக் காட்டு", "Phone number or email is required.": "தொலைபேசி எண் அல்லது மின்னஞ்சல் தேவை.",
    "Password is required.": "கடவுச்சொல் தேவை.", "Create your account": "உங்கள் கணக்கை உருவாக்குங்கள்", "Account created!": "கணக்கு உருவாக்கப்பட்டது!",
    "Full name": "முழுப் பெயர்", "Your full name": "முழுப் பெயரை உள்ளிடவும்", "Phone number": "தொலைபேசி எண்", "Email address": "மின்னஞ்சல் முகவரி",
    "I am a…": "நான்…", "Select role (optional)": "பங்கைத் தேர்ந்தெடுக்கவும் (விருப்பம்)", Farmer: "விவசாயி", Buyer: "வாங்குபவர்",
    "Agricultural Expert": "வேளாண் நிபுணர்", "Service Provider": "சேவை வழங்குநர்", "Confirm password": "கடவுச்சொல்லை உறுதிப்படுத்தவும்",
    "Create a password": "கடவுச்சொல்லை உருவாக்கவும்", "Repeat your password": "கடவுச்சொல்லை மீண்டும் உள்ளிடவும்", "Creating account…": "கணக்கு உருவாக்கப்படுகிறது…",
    "Already have an account?": "ஏற்கனவே கணக்கு உள்ளதா?", "Sign in now": "இப்போது உள்நுழைக",
    Dashboard: "டாஷ்போர்டு", "My Farms": "என் பண்ணைகள்", "Crop Cycles": "பயிர் சுழற்சிகள்", Activities: "செயல்பாடுகள்",
    "Weather & Advisory": "வானிலை மற்றும் ஆலோசனை", "Farmer Verification": "விவசாயி சரிபார்ப்பு", "Farm Management": "பண்ணை மேலாண்மை",
    Administration: "நிர்வாகம்", "Admin Portal": "நிர்வாகத் தளம்", "Super Admin": "சூப்பர் நிர்வாகி", "System & Tools": "அமைப்பு மற்றும் கருவிகள்",
    "My Profile": "என் சுயவிவரம்", "Sign Out": "வெளியேறு", Home: "முகப்பு", Farms: "பண்ணைகள்", Weather: "வானிலை", More: "மேலும்", Profile: "சுயவிவரம்",
    "Preferred language": "விருப்ப மொழி", Welcome: "வரவேற்கிறோம்", Role: "பங்கு", Namaste: "வணக்கம்",
    "Complete Verification": "சரிபார்ப்பை முடிக்கவும்", "Log Activity": "செயலைப் பதிவு செய்யவும்", "Tasks Due Today": "இன்றைய பணிகள்",
    "View all activities": "அனைத்து செயல்பாடுகளையும் காண்க", "Main Navigation": "முதன்மை வழிசெலுத்தல்", "Agri Platform": "வேளாண் தளம்",
    Verified: "சரிபார்க்கப்பட்டது", Pending: "நிலுவையில்", Governance: "நிர்வாகம்",
    "Your profile": "உங்கள் சுயவிவரம்", "Account info": "கணக்கு விவரம்", Phone: "தொலைபேசி", Email: "மின்னஞ்சல்", Language: "மொழி",
    Verification: "சரிபார்ப்பு", "Edit profile": "சுயவிவரத்தைத் திருத்து", "Edit name & language": "பெயர் மற்றும் மொழியை மாற்று",
    "Saving…": "சேமிக்கப்படுகிறது…", "Save changes": "மாற்றங்களைச் சேமி", Cancel: "ரத்து செய்",
    "Change password": "கடவுச்சொல்லை மாற்று", "Update password": "கடவுச்சொல்லைப் புதுப்பி", Sessions: "அமர்வுகள்", "Sign out all devices": "அனைத்து சாதனங்களிலிருந்தும் வெளியேறு",
    "Add New Farm": "புதிய பண்ணையைச் சேர்", "No Farms Registered Yet": "பண்ணைகள் இன்னும் பதிவு செய்யப்படவில்லை", "Add Your First Farm": "முதல் பண்ணையைச் சேர்",
    "Farm Name": "பண்ணையின் பெயர்", "Farm location": "பண்ணை அமைவிடம்", "Soil type": "மண் வகை", optional: "விருப்பம்",
    "No Plots in this Farm Yet": "இந்தப் பண்ணையில் இன்னும் நிலப்பகுதிகள் இல்லை",
  },
  bn: {
    "Your agriculture companion": "আপনার কৃষি সঙ্গী", "Language / भाषा": "ভাষা",
    "Phone number or email": "ফোন নম্বর বা ইমেল", "Enter your phone or email": "আপনার ফোন নম্বর বা ইমেল লিখুন",
    Password: "পাসওয়ার্ড", "Enter your password": "আপনার পাসওয়ার্ড লিখুন", "Sign in": "সাইন ইন করুন",
    "Signing in…": "সাইন ইন হচ্ছে…", "Don't have an account?": "অ্যাকাউন্ট নেই?", "Create account": "অ্যাকাউন্ট তৈরি করুন",
    "Hide password": "পাসওয়ার্ড লুকান", "Show password": "পাসওয়ার্ড দেখান", "Phone number or email is required.": "ফোন নম্বর বা ইমেল আবশ্যক।",
    "Password is required.": "পাসওয়ার্ড আবশ্যক।", "Create your account": "আপনার অ্যাকাউন্ট তৈরি করুন", "Account created!": "অ্যাকাউন্ট তৈরি হয়েছে!",
    "Full name": "পুরো নাম", "Your full name": "আপনার পুরো নাম লিখুন", "Phone number": "ফোন নম্বর", "Email address": "ইমেল ঠিকানা",
    "I am a…": "আমি…", "Select role (optional)": "ভূমিকা নির্বাচন করুন (ঐচ্ছিক)", Farmer: "কৃষক", Buyer: "ক্রেতা",
    "Agricultural Expert": "কৃষি বিশেষজ্ঞ", "Service Provider": "পরিষেবা প্রদানকারী", "Confirm password": "পাসওয়ার্ড নিশ্চিত করুন",
    "Create a password": "পাসওয়ার্ড তৈরি করুন", "Repeat your password": "পাসওয়ার্ড আবার লিখুন", "Creating account…": "অ্যাকাউন্ট তৈরি হচ্ছে…",
    "Already have an account?": "ইতিমধ্যে অ্যাকাউন্ট আছে?", "Sign in now": "এখনই সাইন ইন করুন",
    Dashboard: "ড্যাশবোর্ড", "My Farms": "আমার খামার", "Crop Cycles": "ফসল চক্র", Activities: "কার্যকলাপ",
    "Weather & Advisory": "আবহাওয়া ও পরামর্শ", "Farmer Verification": "কৃষক যাচাইকরণ", "Farm Management": "খামার ব্যবস্থাপনা",
    Administration: "প্রশাসন", "Admin Portal": "অ্যাডমিন পোর্টাল", "Super Admin": "সুপার অ্যাডমিন", "System & Tools": "সিস্টেম ও সরঞ্জাম",
    "My Profile": "আমার প্রোফাইল", "Sign Out": "সাইন আউট", Home: "হোম", Farms: "খামার", Weather: "আবহাওয়া", More: "আরও", Profile: "প্রোফাইল",
    "Preferred language": "পছন্দের ভাষা", Welcome: "স্বাগতম", Role: "ভূমিকা", Namaste: "নমস্কার",
    "Complete Verification": "যাচাইকরণ সম্পূর্ণ করুন", "Log Activity": "কার্যকলাপ নথিভুক্ত করুন", "Tasks Due Today": "আজকের কাজ",
    "View all activities": "সব কার্যকলাপ দেখুন", "Main Navigation": "প্রধান নেভিগেশন", "Agri Platform": "কৃষি প্ল্যাটফর্ম",
    Verified: "যাচাইকৃত", Pending: "অপেক্ষমাণ", Governance: "প্রশাসন",
    "Your profile": "আপনার প্রোফাইল", "Account info": "অ্যাকাউন্টের তথ্য", Phone: "ফোন", Email: "ইমেল", Language: "ভাষা",
    Verification: "যাচাইকরণ", "Edit profile": "প্রোফাইল সম্পাদনা করুন", "Edit name & language": "নাম ও ভাষা পরিবর্তন করুন",
    "Saving…": "সংরক্ষণ হচ্ছে…", "Save changes": "পরিবর্তন সংরক্ষণ করুন", Cancel: "বাতিল করুন",
    "Change password": "পাসওয়ার্ড পরিবর্তন করুন", "Update password": "পাসওয়ার্ড আপডেট করুন", Sessions: "সেশন", "Sign out all devices": "সব ডিভাইস থেকে সাইন আউট করুন",
    "Add New Farm": "নতুন খামার যোগ করুন", "No Farms Registered Yet": "এখনও কোনো খামার নিবন্ধিত হয়নি", "Add Your First Farm": "আপনার প্রথম খামার যোগ করুন",
    "Farm Name": "খামারের নাম", "Farm location": "খামারের অবস্থান", "Soil type": "মাটির ধরন", optional: "ঐচ্ছিক",
    "No Plots in this Farm Yet": "এই খামারে এখনও কোনো প্লট নেই",
  },
};

function readStoredLanguage(): LanguageCode | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && supported.has(value) ? value as LanguageCode : null;
  } catch {
    return null;
  }
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const storedLanguage = readStoredLanguage();
  const [language, setLanguageState] = useState<LanguageCode>(() => storedLanguage ?? "en");
  const [hasExplicitLanguage, setHasExplicitLanguage] = useState(Boolean(storedLanguage));

  useEffect(() => {
    if (!hasExplicitLanguage && user?.preferred_language && supported.has(user.preferred_language)) {
      setLanguageState(user.preferred_language as LanguageCode);
    }
  }, [hasExplicitLanguage, user?.id, user?.preferred_language]);

  useEffect(() => {
    document.documentElement.lang = language;
    if (hasExplicitLanguage) {
      try { localStorage.setItem(STORAGE_KEY, language); } catch { /* App language still works for this session. */ }
    }
  }, [language, hasExplicitLanguage]);

  const setLanguage = useCallback((value: string) => {
    if (!supported.has(value)) return;
    setLanguageState(value as LanguageCode);
    setHasExplicitLanguage(true);
  }, []);

  const t = useCallback((englishText: string) => {
    if (language === "en") return englishText;
    return catalogs[language]?.[englishText] ?? englishText;
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
