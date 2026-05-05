#!/usr/bin/env python3
"""
generate_company_sectors.py - FSS Company Taxonomy to Sector Mapping

Pulls all company codes from the Dow Jones FSS taxonomy via the factiva_sentiment
module, maps each IndustryDescriptor to a broader Sector, and outputs CSV files.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

# Load .env from project root
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass

# Add factiva_sentiment package to import path
FACTIVA_SENTIMENT_PATH = Path("/Users/leckiej/Documents/sandbox/factiva_analytics/factiva_sentiment/src")
sys.path.insert(0, str(FACTIVA_SENTIMENT_PATH))

import pandas as pd
from factiva_sentiment import SentimentClient

# =============================================================================
# SECTOR MAPPING CONFIGURATION
# =============================================================================

# Explicit overrides for known edge cases (checked BEFORE keyword matching)
SECTOR_OVERRIDES: dict[str, str] = {
    "Retail REITs": "Real Estate",
    "Self-storage Unit Rental/Leasing": "Real Estate",
    "Diversified Holding Companies": "Financial Services",
    "Shell Company": "Financial Services",
    "Private Equity": "Financial Services",
    "Venture Capital": "Financial Services",
    "Business Development Companies/Venture Capital Trusts": "Financial Services",
    "Savings Institutions": "Financial Services",
    "Security Brokering/Dealing": "Financial Services",
    "Online Security Brokering/Dealing": "Financial Services",
    "Securities/Commodity Exchange Activities": "Financial Services",
    "Commodity Contracts Brokering/Dealing": "Financial Services",
    "Post Trade Services": "Financial Services",
    "Asset Based Lending Services": "Financial Services",
    "Peer-to-Peer Lending Platforms": "Financial Services",
    "Payday Loans": "Financial Services",
    "Rating Agencies": "Financial Services",
    "Algorithmic/Quantitative Trading": "Financial Services",
    "Buy-Now-Pay-Later Services": "Financial Services",
    "Annuities": "Financial Services",
    "Debit Cards": "Financial Services",
    "Cryptocurrency Exchanges": "Financial Services",
    "Virtual Currencies/Cryptocurrencies": "Financial Services",
    "Mobile Payment Systems": "Financial Services",
    "Smart Cards": "Financial Services",
    "Legal Services": "Professional Services",
    "Professional Bodies": "Professional Services",
    "Accounting": "Professional Services",
    "Accounting/Consulting": "Professional Services",
    "Management Consulting": "Professional Services",
    "Business Consultancy": "Professional Services",
    "IT Consulting": "Software & Technology",
    "IT Support Services": "Software & Technology",
    "Cloud Computing": "Software & Technology",
    "Artificial Intelligence Technologies": "Software & Technology",
    "Edge Computing": "Software & Technology",
    "Metaverse": "Software & Technology",
    "Virtual Reality Technologies": "Software & Technology",
    "Networking": "Software & Technology",
    "LAN/WAN Hardware": "Software & Technology",
    "Network Monitoring/Testing Tools": "Software & Technology",
    "Web Hosting": "Software & Technology",
    "Web Browsers": "Software & Technology",
    "Online Service Providers": "Software & Technology",
    "Digital Content Services": "Software & Technology",
    "Digital Libraries/Archives": "Software & Technology",
    "Computing": "Software & Technology",
    "Graphics Processing Units": "Software & Technology",
    "Motherboards": "Software & Technology",
    "Chipsets": "Software & Technology",
    "Integrated Circuits": "Software & Technology",
    "Analog Integrated Circuits": "Software & Technology",
    "Passive Components": "Software & Technology",
    "Printed Circuit Boards": "Software & Technology",
    "Fiber Optic Equipment": "Software & Technology",
    "Radio Frequency/Microwave Components": "Software & Technology",
    "Radio Frequency Identification Equipment": "Software & Technology",
    "Point of Sale Systems": "Software & Technology",
    "Satellites": "Software & Technology",
    "Satellite Navigation Systems": "Software & Technology",
    "E-commerce": "Retail",
    "Etailing": "Retail",
    "B2B e-commerce": "Retail",
    "Online Auctions": "Retail",
    "Motor Vehicle Dealing": "Retail",
    "New Car Dealing": "Retail",
    "Used Car Dealing": "Retail",
    "Boat Dealing": "Retail",
    "Garden Centers": "Retail",
    "Florists": "Retail",
    "Newsagents": "Retail",
    "Automatic Vending Machines": "Retail",
    "Wholesalers": "Retail",
    "Clothing/Textile Wholesalers": "Retail",
    "Automobile/Automobile Part Wholesalers": "Retail",
    "Clothing": "Consumer Goods",
    "Clothing Accessories": "Consumer Goods",
    "Clothing/Textiles": "Consumer Goods",
    "Designer Clothing": "Consumer Goods",
    "Sports Clothing/Footwear": "Consumer Goods",
    "Safety/Protective Clothing": "Consumer Goods",
    "Footwear": "Consumer Goods",
    "Sports Footwear": "Consumer Goods",
    "Textiles": "Consumer Goods",
    "Textile Furnishings": "Consumer Goods",
    "Fabric Mills": "Consumer Goods",
    "Fiber/Yarn/Thread": "Consumer Goods",
    "Artificial/Synthetic Fibers": "Consumer Goods",
    "Leather/Fur Goods": "Consumer Goods",
    "Jewelry": "Consumer Goods",
    "Luxury Goods": "Consumer Goods",
    "Luxury Leather Goods": "Consumer Goods",
    "Luxury Watches": "Consumer Goods",
    "Watches/Clocks/Parts": "Consumer Goods",
    "Luggage": "Consumer Goods",
    "Fragrance/Perfume": "Consumer Goods",
    "Make-up Products": "Consumer Goods",
    "Hair Care Products": "Consumer Goods",
    "Skin Care Products": "Consumer Goods",
    "Skin Hygiene Products": "Consumer Goods",
    "Facial Care Products": "Consumer Goods",
    "Sun Care Products": "Consumer Goods",
    "Body Care Products": "Consumer Goods",
    "Oral Care Products": "Consumer Goods",
    "Detergent/Cleaning Products": "Consumer Goods",
    "Houseware": "Consumer Goods",
    "Furniture": "Consumer Goods",
    "Wooden Furniture": "Consumer Goods",
    "Office Furniture": "Consumer Goods",
    "Floor Coverings": "Consumer Goods",
    "Home Improvement Products": "Consumer Goods",
    "Toys/Games": "Consumer Goods",
    "Sports Equipment": "Consumer Goods",
    "Sports Goods": "Consumer Goods",
    "Bicycles/Bicycle Parts": "Consumer Goods",
    "Baby Products": "Consumer Goods",
    "Pet Products": "Consumer Goods",
    "Eyeglasses/Spectacles": "Consumer Goods",
    "Cameras": "Consumer Goods",
    "Audio/Video Equipment": "Consumer Goods",
    "Home Networking/Smart Appliances": "Consumer Goods",
    "Gardening Equipment/Tools": "Consumer Goods",
    "Cutlery/Hand Tools": "Consumer Goods",
    "Photographic Equipment": "Consumer Goods",
    "Dairy Products": "Consumer Goods",
    "Dairy Frozen Desserts": "Consumer Goods",
    "Bread/Bakery Products": "Consumer Goods",
    "Chocolate/Confectionery": "Consumer Goods",
    "Cookies/Crackers": "Consumer Goods",
    "Condiments/Sauces": "Consumer Goods",
    "Soft Drinks": "Consumer Goods",
    "Bottled Water": "Consumer Goods",
    "Coffee Products": "Consumer Goods",
    "Tea Products": "Consumer Goods",
    "Wine": "Consumer Goods",
    "Sparkling Wine": "Consumer Goods",
    "Brewing": "Consumer Goods",
    "Distilling": "Consumer Goods",
    "Sugar": "Consumer Goods",
    "Sugar Products": "Consumer Goods",
    "Sugar Substitutes": "Consumer Goods",
    "Flour/Malt Products": "Consumer Goods",
    "Rice Products": "Consumer Goods",
    "Breakfast Cereals": "Consumer Goods",
    "Ready Made Meals": "Consumer Goods",
    "Meat Processing": "Consumer Goods",
    "Poultry Processing": "Consumer Goods",
    "Dietary/Nutritional Supplements": "Consumer Goods",
    "Cigarettes": "Consumer Goods",
    "Marijuana Products": "Consumer Goods",
    "Starch": "Consumer Goods",
    "Fruit/Vegetable Juices": "Consumer Goods",
    "Recreational Vehicles": "Consumer Goods",
    "Recreational Boats": "Consumer Goods",
    "Video Game Consoles": "Consumer Goods",
    "Cell/Mobile Phones": "Consumer Goods",
    "Mobile Devices": "Consumer Goods",
    "Passenger Cars": "Manufacturing",
    "Motor Vehicle Parts": "Manufacturing",
    "Motor Vehicles": "Manufacturing",
    "Vehicle Engine/Engine Parts": "Manufacturing",
    "Commercial Vehicles": "Manufacturing",
    "Trucks/Lorries/Vans": "Manufacturing",
    "Buses/Coaches": "Manufacturing",
    "Motorcycles": "Manufacturing",
    "Tires": "Manufacturing",
    "Aircraft Engines": "Manufacturing",
    "Civil Aircraft": "Manufacturing",
    "Military Aircraft": "Manufacturing",
    "Helicopters": "Manufacturing",
    "Spacecraft": "Manufacturing",
    "Drones": "Manufacturing",
    "Military Vehicles": "Manufacturing",
    "Military Watercraft": "Manufacturing",
    "Military Submarines/Submersibles": "Manufacturing",
    "Guided Missiles": "Manufacturing",
    "Ammunition": "Manufacturing",
    "Firearms": "Manufacturing",
    "Aircraft Modification": "Manufacturing",
    "Aircraft Cabin Equipment": "Manufacturing",
    "Avionics": "Manufacturing",
    "Alternative Fuel Vehicles": "Manufacturing",
    "Alternative Fuel Aircraft": "Manufacturing",
    "Dual Mode Vehicles": "Manufacturing",
    "Connected Vehicle Technologies": "Manufacturing",
    "Autonomous Driving Technologies": "Manufacturing",
    "Simulators": "Manufacturing",
    "Turbines": "Manufacturing",
    "Compressors/Hydraulic Equipment": "Manufacturing",
    "Heating/Cooling/Air Treatment Equipment": "Manufacturing",
    "Environmental Control Systems": "Manufacturing",
    "Handling Equipment": "Manufacturing",
    "Measuring/Precision Instruments": "Manufacturing",
    "Optical Instruments": "Manufacturing",
    "Air/Nautical Navigational Instruments": "Manufacturing",
    "Batteries": "Manufacturing",
    "LED Technologies": "Manufacturing",
    "Forging/Stamping": "Manufacturing",
    "Screws/Nuts/Bolts": "Manufacturing",
    "Plumbing Fittings/Fixtures": "Manufacturing",
    "Alarms/Signaling Equipment": "Manufacturing",
    "Radio/Television Equipment": "Manufacturing",
    "Sawmill/Woodworking Machines": "Manufacturing",
    "Plastics Products": "Materials",
    "Plastic Containers/Packaging": "Materials",
    "Synthetic Resins/Polymers": "Materials",
    "Synthetic Dyes/Pigments": "Materials",
    "Rubber Products": "Materials",
    "Aluminum": "Materials",
    "Copper/Copper Alloys": "Materials",
    "Glass/Glass Products": "Materials",
    "Glass Fiber": "Materials",
    "Glass Containers/Packaging": "Materials",
    "Pottery/Ceramics/Porcelain": "Materials",
    "Stone/Slate Products": "Materials",
    "Sand/Gravel/Clay": "Materials",
    "Lime/Gypsum Products": "Materials",
    "Asphalt/Tar Products": "Materials",
    "Adhesives": "Materials",
    "Paints/Coatings": "Materials",
    "Abrasive Products": "Materials",
    "Explosives": "Materials",
    "Wood Products": "Materials",
    "Wooden Containers/Packaging": "Materials",
    "Sawmills/Wood Preservation": "Materials",
    "Pulp Mills": "Materials",
    "Printing Inks": "Materials",
    "Packaging": "Materials",
    "Packaging/Labeling Services": "Materials",
    "Asbestos Products": "Materials",
    "Fertilizers": "Agriculture",
    "Pesticides": "Agriculture",
    "Seeds": "Agriculture",
    "Animal Feed": "Agriculture",
    "Animal Slaughtering/Processing": "Agriculture",
    "Aquaculture": "Agriculture",
    "Fishing": "Agriculture",
    "Horticulture": "Agriculture",
    "Floriculture/Plant Nurseries": "Agriculture",
    "Forestry/Logging": "Agriculture",
    "Fruit Growing": "Agriculture",
    "Vegetable Growing": "Agriculture",
    "Citrus Groves": "Agriculture",
    "Tea Growing": "Agriculture",
    "Coffee Growing": "Agriculture",
    "Cocoa Growing": "Agriculture",
    "Rubber Growing": "Agriculture",
    "Marijuana Growing/Cultivation": "Agriculture",
    "Beekeeping/Honey Production": "Agriculture",
    "Biofuels": "Energy",
    "Fuel Cells": "Energy",
    "Fuel Additives": "Energy",
    "Alternative Fuels": "Energy",
    "Fossil Fuels": "Energy",
    "Nuclear Fuel": "Energy",
    "Coke Products": "Energy",
    "Offshore Drilling": "Energy",
    "Fracking Services": "Energy",
    "Carbon Capture/Storage": "Energy",
    "District Heating/Cooling": "Energy",
    "Water Utilities": "Energy",
    "Multiutilities": "Energy",
    "Utilities": "Energy",
    "Pipeline Laying": "Energy",
    "Port/Harbor Operations": "Transportation",
    "Airports": "Transportation",
    "Bus/Coach Services": "Transportation",
    "Urban/Commuter Transit": "Transportation",
    "Highway Operation": "Transportation",
    "Ground Services": "Transportation",
    "Postal/Courier Services": "Transportation",
    "Ride-Hailing Platforms/Services": "Transportation",
    "Taxi/Limousine Services": "Transportation",
    "Moving/Relocation Services": "Transportation",
    "Parking Lots": "Transportation",
    "Ship Rental/Leasing": "Transportation",
    "Aircraft Rental/Leasing": "Transportation",
    "Road Vehicle Rental/Leasing": "Transportation",
    "Commercial Vehicle Rental/Leasing": "Transportation",
    "Passenger Car Rental/Leasing": "Transportation",
    "Shipbreaking": "Transportation",
    "Streaming Services": "Media & Entertainment",
    "Television Program Production": "Media & Entertainment",
    "Audiovisual Production": "Media & Entertainment",
    "Video Distribution": "Media & Entertainment",
    "Digital Marketing Services": "Media & Entertainment",
    "News Syndicates": "Media & Entertainment",
    "Online Gambling": "Media & Entertainment",
    "Gambling Industries": "Media & Entertainment",
    "Sports Betting": "Media & Entertainment",
    "Sports Teams/Clubs": "Media & Entertainment",
    "Sporting Event Promotion": "Media & Entertainment",
    "Performing Arts/Sports Promotion": "Media & Entertainment",
    "Sporting Facilities/Venues": "Media & Entertainment",
    "Sports/Recreation Centers": "Media & Entertainment",
    "Sports/Fitness Instruction": "Media & Entertainment",
    "Sports Technologies": "Media & Entertainment",
    "Museums/Galleries/Gardens": "Media & Entertainment",
    "Theatres/Performing Arts Companies": "Media & Entertainment",
    "Amusement/Theme Parks": "Media & Entertainment",
    "Dating Services": "Media & Entertainment",
    "Art Dealing": "Media & Entertainment",
    "Doctors/Physicians": "Healthcare",
    "Dental Care": "Healthcare",
    "Dental Equipment/Implants": "Healthcare",
    "Outpatient Care": "Healthcare",
    "Residential Care": "Healthcare",
    "Biological Therapy": "Healthcare",
    "Genomics": "Healthcare",
    "Proteomics": "Healthcare",
    "Stem Cell Research": "Healthcare",
    "Orthopedic/Prosthetic Implants/Devices": "Healthcare",
    "Surgical Devices": "Healthcare",
    "Vaccines": "Healthcare",
    "Antibiotics": "Healthcare",
    "Antivirals": "Healthcare",
    "Analgesics": "Healthcare",
    "Hormone Products": "Healthcare",
    "Dermatological Treatments": "Healthcare",
    "Respiratory/Allergy Treatments": "Healthcare",
    "Contact Lenses": "Healthcare",
    "Eyewear/Ocular Implants": "Healthcare",
    "Donor Clinics/Services": "Healthcare",
    "Emergency Treatment/Care": "Healthcare",
    "Hospice Care": "Healthcare",
    "Physiotherapists": "Healthcare",
    "Traditional Chinese Medicine Practitioners": "Healthcare",
    "Veterinary Services": "Healthcare",
    "Scientific Research Services": "Healthcare",
    "Amusement/Theme Parks": "Hospitality",
    "Bars/Public Houses/Nightclubs": "Hospitality",
    "Lodgings": "Hospitality",
    "Campgrounds/Campsites": "Hospitality",
    "Bed and Breakfast Inns": "Hospitality",
    "Tour Operators": "Hospitality",
    "Ticket Agents": "Hospitality",
    "Caterers": "Hospitality",
    "Special Trade Contractors": "Construction",
    "Architects": "Construction",
    "Plumbing Contractors": "Construction",
    "Wrecking/Demolition Contractors": "Construction",
    "Interior Design Services": "Construction",
    "Landscaping/Gardening Services": "Construction",
    "Land Reclamation": "Construction",
    "Integrated Communications Providers": "Telecommunications",
    "Telephone Call Centers": "Telecommunications",
    "Telemarketing": "Telecommunications",
}

# Keyword-based sector mapping (first match wins, priority order)
# Each tuple: (Sector Name, [keywords to match against IndustryDescriptor])
SECTOR_KEYWORDS: list[tuple[str, list[str]]] = [
    ("Real Estate", ["real estate", "reit", "property", "housing"]),
    ("Retail", ["retail", "store", "shop", "department", "wholesal"]),
    ("Software & Technology", [
        "software", "technology", "it services", "computer",
        "data", "internet", "cyber", "semiconductor", "electronic",
        "digital", "cloud", "network", "computing",
    ]),
    ("Energy", [
        "energy", "oil", "gas", "petroleum", "coal",
        "solar", "wind", "power", "utility", "electric",
        "fuel", "pipeline", "drilling",
    ]),
    ("Healthcare", [
        "health", "pharma", "medical", "biotech",
        "hospital", "drug", "therapeut", "dental",
        "surgical", "diagnostic", "clinical", "nurs",
    ]),
    ("Financial Services", [
        "bank", "insurance", "financ", "credit",
        "invest", "fund", "asset management", "brokerage",
        "mortgage", "lending", "securit", "exchange",
        "cryptocurrency", "payment",
    ]),
    ("Manufacturing", [
        "manufactur", "industrial", "machinery",
        "automotive", "aerospace", "defense",
        "motor vehicle", "aircraft", "engine",
        "instrument", "equipment",
    ]),
    ("Media & Entertainment", [
        "media", "entertainment", "broadcast", "publishing",
        "film", "music", "gaming", "advertis",
        "television", "radio", "streaming", "video",
        "sport", "gambling", "betting",
    ]),
    ("Telecommunications", [
        "telecom", "wireless", "cable", "broadband",
        "satellite", "mobile comm",
    ]),
    ("Consumer Goods", [
        "food", "beverage", "tobacco", "consumer",
        "household", "personal", "apparel", "cosmetic",
        "clothing", "footwear", "textile", "jewelry",
        "watch", "fragrance", "perfume", "toy",
        "furniture", "mattress",
    ]),
    ("Transportation", [
        "transport", "airline", "shipping", "logistics",
        "rail", "freight", "trucking", "courier",
        "postal", "airport", "port", "harbor",
        "bus", "transit", "taxi", "limousine",
    ]),
    ("Materials", [
        "mining", "metal", "chemical", "material",
        "steel", "cement", "paper", "lumber",
        "plastic", "rubber", "glass", "ceramic",
        "polymer", "resin", "paint", "coating",
        "adhesive", "abrasive", "packaging",
    ]),
    ("Agriculture", [
        "agricultur", "farm", "crop", "livestock",
        "fishing", "aquacultur", "seed", "fertiliz",
        "pesticid", "forestry", "logging", "horticult",
        "growing", "nurseri",
    ]),
    ("Construction", [
        "construct", "building", "engineer",
        "architect", "contractor", "plumbing",
        "demolit", "landscap",
    ]),
    ("Education", ["education", "school", "university", "training"]),
    ("Hospitality", [
        "hotel", "restaurant", "hospitality", "leisure",
        "travel", "tourism", "tour operator", "lodging",
        "campground", "caterer", "bar", "nightclub",
    ]),
    ("Professional Services", [
        "consulting", "consultancy", "legal",
        "accounting", "recruitment", "staffing",
        "human resource", "payroll", "tax preparation",
        "market research", "public relation",
        "design service", "translation",
    ]),
    ("Environmental Services", [
        "waste", "recycl", "wastewater", "desalinat",
        "environmental", "pest control",
    ]),
]


# =============================================================================
# SUB-SECTOR MAPPING
# =============================================================================
# Structure: {Sector: [(SubSector, [keywords])]}
# First keyword match wins within a sector. Fallback = "Other {Sector}".

SUB_SECTOR_MAPPING: dict[str, list[tuple[str, list[str]]]] = {
    "Financial Services": [
        ("Banking", ["banking", "commercial bank", "central bank", "regional bank", "international bank", "islamic bank", "development bank", "savings", "credit union"]),
        ("Insurance", ["insurance", "reinsurance"]),
        ("Investment Management", ["asset management", "hedge fund", "mutual fund", "pension fund", "exchange traded", "investment trust", "sovereign wealth", "private equity", "venture capital", "alternative invest", "sustainable invest", "private credit"]),
        ("Securities & Trading", ["brokerage", "security brokering", "commodity", "exchange activities", "algorithmic", "post trade"]),
        ("Lending & Credit", ["lending", "credit", "mortgage", "payday", "financing", "buy-now-pay"]),
        ("Payments & Fintech", ["payment", "cryptocurrency", "virtual currenc", "debit card", "smart card"]),
        ("Holding Companies", ["holding compan", "shell company", "diversified holding"]),
        ("Other Financial Services", ["rating", "investigation", "financ"]),
    ],
    "Software & Technology": [
        ("Hardware & Semiconductors", ["semiconductor", "chipset", "motherboard", "integrated circuit", "passive component", "printed circuit", "graphics processing", "computer hardware", "server", "storage", "printer", "scanner", "monitor", "display", "peripheral", "desktop", "portable", "tablet", "supercomputer", "optoelectronic"]),
        ("Cloud & Infrastructure", ["cloud", "data center", "colocation", "web hosting", "web browser"]),
        ("AI & Emerging Tech", ["artificial intelligence", "machine learning", "blockchain", "virtual reality", "metaverse", "3d printing", "4d printing", "internet-of-things", "wearable", "edge computing"]),
        ("IT Services", ["it consulting", "it support", "computer services", "computer systems design", "data processing", "data recovery", "data services", "data mining", "online service"]),
        ("Networking & Connectivity", ["networking", "lan/wan", "network monitoring", "fiber optic", "radio frequency", "satellite", "wireless area"]),
        ("Electronics", ["electronic", "consumer electronics", "home electronics", "personal electronics", "automobile electronics", "industrial electronics"]),
        ("Digital Services", ["digital", "e-learning", "educational technology", "fintech", "financial technology", "insurance technology", "regulatory technology", "property technology", "agriculture technology"]),
        ("Software", ["software", "applications", "games software", "simulation", "cad/cam", "business intelligence", "crm", "enterprise management", "supply chain management", "knowledge management", "productivity", "programming tools", "virtualization", "voip", "voice recognition", "instant messaging", "security/privacy"]),
    ],
    "Energy": [
        ("Oil & Gas", ["oil", "gas", "petroleum", "integrated oil", "upstream", "midstream", "downstream", "fracking", "offshore drilling", "oil sands"]),
        ("Power Generation", ["power generation", "nuclear power", "fossil fuel power", "hydropower", "biomass", "waste-to-energy", "geothermal"]),
        ("Renewables", ["solar", "wind", "renewable", "biofuel", "alternative fuel"]),
        ("Utilities", ["utility", "utilities", "electric utility", "gas utility", "water utility", "multiutility", "electric power distribution", "electric power transmission"]),
        ("Fuel & Mining", ["coal", "nuclear fuel", "coke", "fuel cell", "fuel additive", "fossil fuel"]),
        ("Energy Equipment", ["oil/gas field machinery", "wind turbine", "solar panel", "renewable energy equipment", "boiler", "tank", "vessel", "electric vehicle charging", "pipeline"]),
        ("Electrical", ["electrical", "electric lighting", "portable power"]),
    ],
    "Healthcare": [
        ("Pharmaceuticals", ["pharma", "drug", "prescription", "over-the-counter", "generic", "biosimilar", "cancer drug", "cardiovascular", "diabetes", "neuroactive", "neurodegenerative", "antibiotic", "antiviral", "vaccine", "analgesic", "hormone", "dermatological", "respiratory"]),
        ("Medical Devices", ["medical device", "diagnostic", "surgical", "orthopedic", "prosthetic", "implant", "drug delivery", "medical equipment", "medical imaging"]),
        ("Healthcare Services", ["hospital", "outpatient", "home healthcare", "emergency", "hospice", "residential care", "mental healthcare", "telehealth", "health maintenance", "healthcare provision", "healthcare support"]),
        ("Biotech & Research", ["biotech", "genomics", "proteomics", "stem cell", "biological therapy", "scientific research", "drug discovery"]),
        ("Dental & Vision", ["dental", "contact lens", "eyewear", "ocular"]),
        ("Health Insurance", ["health insurance", "health/medical insurance", "government sponsored health", "pharmacy benefit"]),
        ("Other Healthcare", ["veterinary", "physiotherapist", "alternative health", "traditional chinese medicine", "doctors/physicians", "donor clinic"]),
    ],
    "Materials": [
        ("Metals & Mining", ["mining", "ore", "metal", "ferrous", "non-ferrous", "aluminum", "copper", "gold", "silver", "lithium", "rare earth", "tin", "tantalum", "tungsten", "lead", "zinc", "precious metal", "gemstone", "foundri"]),
        ("Chemicals", ["chemical", "petrochemical", "agrochemical", "inorganic", "organic"]),
        ("Plastics & Polymers", ["plastic", "polymer", "resin", "synthetic"]),
        ("Paper & Packaging", ["paper", "pulp", "packaging", "cardboard", "sanitary paper"]),
        ("Building Materials", ["building material", "cement", "concrete", "clay", "roofing", "prefabricated", "limestone"]),
        ("Glass & Ceramics", ["glass", "ceramic", "porcelain", "pottery"]),
        ("Other Materials", ["rubber", "adhesive", "abrasive", "paint", "coating", "dye", "pigment", "asphalt", "asbestos", "stone", "slate", "sand", "gravel", "lime", "gypsum", "explosive", "wood", "printing ink"]),
    ],
    "Consumer Goods": [
        ("Food & Beverage", ["food", "beverage", "dairy", "bread", "bakery", "cereal", "chocolate", "confectionery", "cookie", "cracker", "condiment", "sauce", "soft drink", "bottled water", "coffee", "tea", "wine", "sparkling", "brewing", "distilling", "sugar", "flour", "malt", "rice", "meat", "poultry", "seafood", "frozen", "preserved", "snack", "juice", "soy", "vegetarian", "halal", "organic", "genetically modified", "functional", "non-alcoholic", "alcoholic", "starch"]),
        ("Apparel & Textiles", ["clothing", "textile", "fabric", "fiber", "yarn", "leather", "footwear", "designer", "fashion", "sports clothing", "sports footwear", "safety/protective", "cut/sew"]),
        ("Personal Care & Beauty", ["skin care", "hair care", "oral care", "sun care", "body care", "facial", "fragrance", "perfume", "make-up", "beauty", "personal care", "cosmetic", "hygiene", "detergent", "cleaning"]),
        ("Home & Household", ["furniture", "floor covering", "home improvement", "home networking", "houseware", "household appliance", "household/institutional", "durable household", "nondurable household", "consumer paper", "office furniture", "wooden furniture", "gardening equipment"]),
        ("Luxury", ["luxury", "jewelry", "watches", "luggage"]),
        ("Recreation & Electronics", ["toy", "game", "sport equipment", "sport goods", "bicycle", "recreational vehicle", "recreational boat", "video game console", "audio/video", "camera", "photographic", "cell/mobile", "mobile device", "consumer electronics", "baby", "pet product", "pet food", "eyeglasses"]),
        ("Tobacco & Cannabis", ["cigarette", "tobacco", "marijuana product"]),
        ("Dietary Supplements", ["dietary", "nutritional supplement"]),
    ],
    "Manufacturing": [
        ("Automotive", ["motor vehicle", "passenger car", "truck", "lorry", "van", "motorcycle", "bus", "coach", "vehicle engine", "automotive", "tire", "autonomous driving", "connected vehicle", "alternative fuel vehicle", "dual mode", "electric vehicle"]),
        ("Aerospace & Defense", ["aerospace", "aircraft", "helicopter", "spacecraft", "drone", "military", "guided missile", "ammunition", "firearm", "avionics", "defense", "civil aircraft"]),
        ("Industrial Machinery", ["machinery", "compressor", "hydraulic", "turbine", "pump", "handling equipment", "construction machinery", "mining machinery", "food product machinery", "chemical industry", "metalworking", "glass working", "plastics/rubber", "textile/leatherwork", "paper industry", "sawmill", "woodworking", "weighing", "printing machinery"]),
        ("Instruments & Electronics", ["measuring", "precision instrument", "optical", "air/nautical", "alarms", "signaling", "radio/television equipment", "led", "battery", "environmental control"]),
        ("Other Manufacturing", ["forging", "stamping", "screws", "nuts", "bolts", "plumbing fitting", "fixture", "simulator", "musical instrument", "mattress", "office equipment", "engineered wood", "industrial ceramic", "dry cleaning/laundry equipment"]),
    ],
    "Media & Entertainment": [
        ("Film, TV & Streaming", ["film", "cinema", "television", "tv ", "streaming", "video", "audiovisual", "motion picture", "multimedia"]),
        ("Publishing", ["publishing", "book", "magazine", "newspaper", "e-book", "printing/publishing"]),
        ("Music & Audio", ["music", "sound", "recording"]),
        ("Broadcasting", ["broadcast", "radio", "cable", "satellite"]),
        ("Advertising & Marketing", ["advertising", "marketing", "media buying", "outdoor advertising", "print advertising", "video advertising", "digital marketing"]),
        ("Sports", ["sport", "sporting", "fitness"]),
        ("Gaming & Gambling", ["gambling", "betting", "online gambling"]),
        ("Venues & Attractions", ["museum", "theatre", "performing arts", "entertainment venue", "amusement", "theme park", "dating", "art dealing"]),
        ("News & Social", ["news syndicate", "social media"]),
    ],
    "Retail": [
        ("Grocery & Food Retail", ["grocery", "supermarket", "food retail", "food/beverage wholesale", "specialty food", "meat/fish", "meal kit", "retail bakery", "beer/wine/liquor"]),
        ("Clothing & Fashion Retail", ["clothing retail", "shoe", "cosmetics/perfume retail"]),
        ("Electronics & Appliance Retail", ["electronics", "computer store", "appliance retail"]),
        ("Specialty Retail", ["specialty retail", "marijuana retail", "optical", "pets/pet supplies", "sporting goods", "toys/games retail", "tobacco/e-cigarette", "book retail", "office supplies", "jewelry retail", "used merchandise", "decorating/diy/hardware"]),
        ("Department & Discount", ["department store", "discount", "shopping mall", "superstore", "mixed retail", "convenience"]),
        ("Auto Retail", ["motor vehicle dealing", "new car", "used car", "boat dealing", "automotive parts/tire"]),
        ("E-commerce", ["e-commerce", "etailing", "online auction", "b2b e-commerce", "non-store", "mail order", "automated retail"]),
        ("Wholesale & Distribution", ["wholesaler", "agricultural raw material", "chemical wholesale", "energy wholesale", "machinery/industrial", "computers/electronic equipment wholesale", "pharmaceutical/medical wholesale", "clothing/textile wholesale", "automobile/automobile part wholesale", "food/beverage wholesale"]),
    ],
    "Real Estate": [
        ("REITs", ["reit", "real estate investment trust"]),
        ("Commercial Real Estate", ["commercial real estate", "office real estate", "industrial real estate", "retail real estate"]),
        ("Residential Real Estate", ["residential"]),
        ("Real Estate Services", ["real estate agent", "broker", "property manager", "real estate services", "real estate/construction"]),
        ("Specialty Real Estate", ["data warehousing", "self-storage", "warehousing/storage", "property technology"]),
        ("Mortgage & Finance", ["mortgage"]),
    ],
    "Construction": [
        ("Building Construction", ["building construction", "residential building", "non-residential", "hotel construction", "school construction", "industrial building", "leisure facility", "building completion", "building refurbishment"]),
        ("Heavy/Civil Construction", ["heavy construction", "highway", "bridge", "dam", "canal", "waterway", "sewer", "tunnel", "airport construction", "harbor construction", "railway construction", "power station", "renewable energy facility", "oil/gas platform", "water treatment plant", "transmission line"]),
        ("Specialty Trades", ["special trade contractor", "plumbing", "wrecking", "demolition", "electrical contractor"]),
        ("Design & Planning", ["architect", "interior design", "landscape", "engineering services"]),
        ("Other Construction", ["construction equipment", "services to facilities", "land reclamation", "shipbuilding"]),
    ],
    "Agriculture": [
        ("Crop Farming", ["corn", "wheat", "soybean", "rice", "cotton", "silk", "dry pea", "bean", "oilseed", "grain", "sugar farming", "sugarcane", "tree nut", "organic farming", "edible oil"]),
        ("Specialty Crops", ["fruit growing", "vegetable growing", "citrus", "tea growing", "coffee growing", "cocoa", "rubber growing", "marijuana growing", "floriculture", "horticulture", "plant nurseri"]),
        ("Livestock", ["cattle", "hog", "pig", "poultry", "sheep", "goat", "livestock", "beekeeping"]),
        ("Fishing & Aquaculture", ["fishing", "aquaculture"]),
        ("Forestry", ["forestry", "logging"]),
        ("Agri-Inputs & Support", ["fertilizer", "pesticide", "seed", "animal feed", "animal slaughtering", "support activities for agriculture", "agriculture technology"]),
    ],
    "Transportation": [
        ("Air", ["airline", "air freight", "chartered", "airport"]),
        ("Road", ["trucking", "bus/coach", "highway", "urban/commuter transit", "ride-hailing", "taxi", "limousine", "vehicle towing"]),
        ("Rail", ["rail", "railroad"]),
        ("Marine", ["marine", "port", "harbor", "ship", "inland water"]),
        ("Logistics & Postal", ["postal", "courier", "messenger", "moving", "relocation", "freight transport", "transportation/logistics"]),
        ("Vehicle Rental", ["rental/leasing", "passenger car rental", "commercial vehicle rental", "road vehicle rental", "aircraft rental", "ship rental"]),
        ("Infrastructure", ["parking", "ground services", "air traffic", "traffic/railroad control"]),
    ],
    "Telecommunications": [
        ("Wireless", ["wireless", "mobile telecom"]),
        ("Wired", ["wired", "fiber optic cable"]),
        ("Satellite", ["satellite telecom"]),
        ("Telecom Services", ["telecommunication services", "integrated communications", "telephone call", "telemarketing", "wires/cables"]),
    ],
    "Education": [
        ("General Education", ["educational services"]),
        ("Vocational & Professional", ["professional/management training", "language school", "automobile driving"]),
    ],
    "Hospitality": [
        ("Lodging", ["hotel", "motel", "lodging", "casino hotel", "bed and breakfast", "campground"]),
        ("Food & Drink", ["restaurant", "caterer", "bar", "pub", "nightclub"]),
        ("Travel & Tourism", ["tour operator", "travel", "tourism", "ticket agent"]),
        ("Leisure Goods", ["leisure/travel goods"]),
    ],
    "Professional Services": [
        ("Consulting", ["consulting", "consultancy", "procurement", "supply chain"]),
        ("Legal", ["legal"]),
        ("Accounting & Tax", ["accounting", "tax preparation"]),
        ("HR & Staffing", ["human resources", "recruitment", "payroll"]),
        ("Marketing & Research", ["marketing", "market research", "public relation", "design service"]),
        ("Translation", ["translation", "interpretation"]),
    ],
    "Environmental Services": [
        ("Waste Management", ["waste management", "waste collection", "waste sorting", "waste treatment", "waste disposal"]),
        ("Recycling", ["recycling", "battery recycling"]),
        ("Water Treatment", ["wastewater", "desalination"]),
        ("Pest Control", ["pest control", "exterminating"]),
    ],
    "Other": [
        ("Miscellaneous Services", []),
    ],
}

# Explicit sub-sector overrides: {industry_descriptor: sub_sector}
SUB_SECTOR_OVERRIDES: dict[str, str] = {
    "Retail REITs": "REITs",
    "Self-storage Unit Rental/Leasing": "Specialty Real Estate",
    "Diversified Holding Companies": "Holding Companies",
    "Shell Company": "Holding Companies",
    "Private Equity": "Investment Management",
    "Venture Capital": "Investment Management",
    "Business Development Companies/Venture Capital Trusts": "Investment Management",
    "Rating Agencies": "Other Financial Services",
    "Algorithmic/Quantitative Trading": "Securities & Trading",
    "Buy-Now-Pay-Later Services": "Lending & Credit",
    "Annuities": "Insurance",
    "Streaming Services": "Film, TV & Streaming",
    "Television Program Production": "Film, TV & Streaming",
    "Audiovisual Production": "Film, TV & Streaming",
    "Video Distribution": "Film, TV & Streaming",
    "Digital Marketing Services": "Advertising & Marketing",
    "News Syndicates": "News & Social",
    "Online Gambling": "Gaming & Gambling",
    "Gambling Industries": "Gaming & Gambling",
    "Sports Betting": "Gaming & Gambling",
    "Sports Teams/Clubs": "Sports",
    "Sporting Event Promotion": "Sports",
    "Performing Arts/Sports Promotion": "Sports",
    "Sporting Facilities/Venues": "Sports",
    "Sports/Recreation Centers": "Sports",
    "Sports/Fitness Instruction": "Sports",
    "Sports Technologies": "Sports",
    "Museums/Galleries/Gardens": "Venues & Attractions",
    "Theatres/Performing Arts Companies": "Venues & Attractions",
    "Amusement/Theme Parks": "Venues & Attractions",
    "Dating Services": "Venues & Attractions",
    "Art Dealing": "Venues & Attractions",
    "IT Consulting": "IT Services",
    "IT Support Services": "IT Services",
    "Cloud Computing": "Cloud & Infrastructure",
    "Artificial Intelligence Technologies": "AI & Emerging Tech",
    "Edge Computing": "AI & Emerging Tech",
    "Metaverse": "AI & Emerging Tech",
    "Virtual Reality Technologies": "AI & Emerging Tech",
    "Networking": "Networking & Connectivity",
    "LAN/WAN Hardware": "Networking & Connectivity",
    "Network Monitoring/Testing Tools": "Networking & Connectivity",
    "Web Hosting": "Cloud & Infrastructure",
    "Web Browsers": "Cloud & Infrastructure",
    "Online Service Providers": "Digital Services",
    "Digital Content Services": "Digital Services",
    "Digital Libraries/Archives": "Digital Services",
    "Computing": "Hardware & Semiconductors",
    "Graphics Processing Units": "Hardware & Semiconductors",
    "Motherboards": "Hardware & Semiconductors",
    "Chipsets": "Hardware & Semiconductors",
    "Integrated Circuits": "Hardware & Semiconductors",
    "Analog Integrated Circuits": "Hardware & Semiconductors",
    "Passive Components": "Hardware & Semiconductors",
    "Printed Circuit Boards": "Hardware & Semiconductors",
    "Fiber Optic Equipment": "Networking & Connectivity",
    "Radio Frequency/Microwave Components": "Networking & Connectivity",
    "Radio Frequency Identification Equipment": "Networking & Connectivity",
    "Satellites": "Networking & Connectivity",
    "Satellite Navigation Systems": "Networking & Connectivity",
    "Point of Sale Systems": "Hardware & Semiconductors",
    "Passenger Cars": "Automotive",
    "Motor Vehicle Parts": "Automotive",
    "Motor Vehicles": "Automotive",
    "Vehicle Engine/Engine Parts": "Automotive",
    "Commercial Vehicles": "Automotive",
    "Trucks/Lorries/Vans": "Automotive",
    "Buses/Coaches": "Automotive",
    "Motorcycles": "Automotive",
    "Tires": "Automotive",
    "Aircraft Engines": "Aerospace & Defense",
    "Civil Aircraft": "Aerospace & Defense",
    "Military Aircraft": "Aerospace & Defense",
    "Helicopters": "Aerospace & Defense",
    "Spacecraft": "Aerospace & Defense",
    "Drones": "Aerospace & Defense",
    "Military Vehicles": "Aerospace & Defense",
    "Military Watercraft": "Aerospace & Defense",
    "Military Submarines/Submersibles": "Aerospace & Defense",
    "Guided Missiles": "Aerospace & Defense",
    "Ammunition": "Aerospace & Defense",
    "Firearms": "Aerospace & Defense",
    "Aircraft Modification": "Aerospace & Defense",
    "Aircraft Cabin Equipment": "Aerospace & Defense",
    "Avionics": "Aerospace & Defense",
    "Alternative Fuel Vehicles": "Automotive",
    "Alternative Fuel Aircraft": "Aerospace & Defense",
    "Dual Mode Vehicles": "Automotive",
    "Connected Vehicle Technologies": "Automotive",
    "Autonomous Driving Technologies": "Automotive",
    "Simulators": "Other Manufacturing",
    "Turbines": "Industrial Machinery",
    "Compressors/Hydraulic Equipment": "Industrial Machinery",
    "Heating/Cooling/Air Treatment Equipment": "Industrial Machinery",
    "Environmental Control Systems": "Instruments & Electronics",
    "Handling Equipment": "Industrial Machinery",
    "Measuring/Precision Instruments": "Instruments & Electronics",
    "Optical Instruments": "Instruments & Electronics",
    "Air/Nautical Navigational Instruments": "Instruments & Electronics",
    "Batteries": "Instruments & Electronics",
    "LED Technologies": "Instruments & Electronics",
    "Forging/Stamping": "Other Manufacturing",
    "Screws/Nuts/Bolts": "Other Manufacturing",
    "Plumbing Fittings/Fixtures": "Other Manufacturing",
    "Alarms/Signaling Equipment": "Instruments & Electronics",
    "Radio/Television Equipment": "Instruments & Electronics",
    "Sawmill/Woodworking Machines": "Industrial Machinery",
    "Biofuels": "Renewables",
    "Fuel Cells": "Fuel & Mining",
    "Fuel Additives": "Fuel & Mining",
    "Alternative Fuels": "Renewables",
    "Fossil Fuels": "Fuel & Mining",
    "Nuclear Fuel": "Fuel & Mining",
    "Coke Products": "Fuel & Mining",
    "Offshore Drilling": "Oil & Gas",
    "Fracking Services": "Oil & Gas",
    "Carbon Capture/Storage": "Renewables",
    "District Heating/Cooling": "Utilities",
    "Water Utilities": "Utilities",
    "Multiutilities": "Utilities",
    "Utilities": "Utilities",
    "Pipeline Laying": "Energy Equipment",
    "Port/Harbor Operations": "Marine",
    "Airports": "Air",
    "Bus/Coach Services": "Road",
    "Urban/Commuter Transit": "Road",
    "Highway Operation": "Infrastructure",
    "Ground Services": "Infrastructure",
    "Postal/Courier Services": "Logistics & Postal",
    "Ride-Hailing Platforms/Services": "Road",
    "Taxi/Limousine Services": "Road",
    "Moving/Relocation Services": "Logistics & Postal",
    "Parking Lots": "Infrastructure",
    "Ship Rental/Leasing": "Vehicle Rental",
    "Aircraft Rental/Leasing": "Vehicle Rental",
    "Road Vehicle Rental/Leasing": "Vehicle Rental",
    "Commercial Vehicle Rental/Leasing": "Vehicle Rental",
    "Passenger Car Rental/Leasing": "Vehicle Rental",
    "Shipbreaking": "Marine",
    "Integrated Communications Providers": "Telecom Services",
    "Telephone Call Centers": "Telecom Services",
    "Telemarketing": "Telecom Services",
    "Bars/Public Houses/Nightclubs": "Food & Drink",
    "Lodgings": "Lodging",
    "Campgrounds/Campsites": "Lodging",
    "Bed and Breakfast Inns": "Lodging",
    "Tour Operators": "Travel & Tourism",
    "Ticket Agents": "Travel & Tourism",
    "Caterers": "Food & Drink",
    "Special Trade Contractors": "Specialty Trades",
    "Architects": "Design & Planning",
    "Plumbing Contractors": "Specialty Trades",
    "Wrecking/Demolition Contractors": "Specialty Trades",
    "Interior Design Services": "Design & Planning",
    "Landscaping/Gardening Services": "Design & Planning",
    "Land Reclamation": "Other Construction",
    "E-commerce": "E-commerce",
    "Etailing": "E-commerce",
    "B2B e-commerce": "E-commerce",
    "Online Auctions": "E-commerce",
    "Motor Vehicle Dealing": "Auto Retail",
    "New Car Dealing": "Auto Retail",
    "Used Car Dealing": "Auto Retail",
    "Boat Dealing": "Auto Retail",
    "Garden Centers": "Specialty Retail",
    "Florists": "Specialty Retail",
    "Newsagents": "Specialty Retail",
    "Automatic Vending Machines": "Specialty Retail",
    "Wholesalers": "Wholesale & Distribution",
    "Clothing/Textile Wholesalers": "Wholesale & Distribution",
    "Automobile/Automobile Part Wholesalers": "Wholesale & Distribution",
    "Fertilizers": "Agri-Inputs & Support",
    "Pesticides": "Agri-Inputs & Support",
    "Seeds": "Agri-Inputs & Support",
    "Animal Feed": "Agri-Inputs & Support",
    "Animal Slaughtering/Processing": "Agri-Inputs & Support",
    "Aquaculture": "Fishing & Aquaculture",
    "Fishing": "Fishing & Aquaculture",
    "Horticulture": "Specialty Crops",
    "Floriculture/Plant Nurseries": "Specialty Crops",
    "Forestry/Logging": "Forestry",
    "Fruit Growing": "Specialty Crops",
    "Vegetable Growing": "Specialty Crops",
    "Citrus Groves": "Specialty Crops",
    "Tea Growing": "Specialty Crops",
    "Coffee Growing": "Specialty Crops",
    "Cocoa Growing": "Specialty Crops",
    "Rubber Growing": "Specialty Crops",
    "Marijuana Growing/Cultivation": "Specialty Crops",
    "Beekeeping/Honey Production": "Livestock",
    "Doctors/Physicians": "Other Healthcare",
    "Dental Care": "Dental & Vision",
    "Dental Equipment/Implants": "Dental & Vision",
    "Outpatient Care": "Healthcare Services",
    "Residential Care": "Healthcare Services",
    "Biological Therapy": "Biotech & Research",
    "Genomics": "Biotech & Research",
    "Proteomics": "Biotech & Research",
    "Stem Cell Research": "Biotech & Research",
    "Orthopedic/Prosthetic Implants/Devices": "Medical Devices",
    "Surgical Devices": "Medical Devices",
    "Vaccines": "Pharmaceuticals",
    "Antibiotics": "Pharmaceuticals",
    "Antivirals": "Pharmaceuticals",
    "Analgesics": "Pharmaceuticals",
    "Hormone Products": "Pharmaceuticals",
    "Dermatological Treatments": "Pharmaceuticals",
    "Respiratory/Allergy Treatments": "Pharmaceuticals",
    "Contact Lenses": "Dental & Vision",
    "Eyewear/Ocular Implants": "Dental & Vision",
    "Donor Clinics/Services": "Other Healthcare",
    "Emergency Treatment/Care": "Healthcare Services",
    "Hospice Care": "Healthcare Services",
    "Physiotherapists": "Other Healthcare",
    "Traditional Chinese Medicine Practitioners": "Other Healthcare",
    "Veterinary Services": "Other Healthcare",
    "Scientific Research Services": "Biotech & Research",
    "Legal Services": "Legal",
    "Professional Bodies": "Consulting",
    "Accounting": "Accounting & Tax",
    "Accounting/Consulting": "Accounting & Tax",
    "Management Consulting": "Consulting",
    "Business Consultancy": "Consulting",
}


# =============================================================================
# CORE LOGIC
# =============================================================================

def classify_industry(industry_descriptor: str) -> str:
    """Map an IndustryDescriptor to a Sector.

    Checks explicit overrides first, then keyword matching (first match wins).
    Returns 'Other' if nothing matches.
    """
    if not industry_descriptor:
        return "Other"

    # Check explicit overrides
    if industry_descriptor in SECTOR_OVERRIDES:
        return SECTOR_OVERRIDES[industry_descriptor]

    # Keyword matching (case-insensitive)
    lower = industry_descriptor.lower()
    for sector, keywords in SECTOR_KEYWORDS:
        for kw in keywords:
            if kw in lower:
                return sector

    return "Other"


def classify_sub_sector(sector: str, industry_descriptor: str) -> str:
    """Map an IndustryDescriptor to a Sub-Sector within its Sector.

    Checks explicit overrides first, then keyword matching within the sector's
    sub-sector list. Returns "Other {Sector}" if nothing matches.
    """
    if not industry_descriptor or not sector:
        return f"Other {sector}" if sector else "Other"

    # Check explicit overrides
    if industry_descriptor in SUB_SECTOR_OVERRIDES:
        return SUB_SECTOR_OVERRIDES[industry_descriptor]

    # Keyword matching within sector
    sub_sectors = SUB_SECTOR_MAPPING.get(sector, [])
    lower = industry_descriptor.lower()
    for sub_sector_name, keywords in sub_sectors:
        for kw in keywords:
            if kw and kw in lower:
                return sub_sector_name

    return f"Other {sector}" if sector != "Other" else "Miscellaneous Services"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate FSS company-to-sector mapping CSV"
    )
    parser.add_argument(
        "--skip-api", action="store_true",
        help="Load companies from cached file instead of calling FSS API",
    )
    parser.add_argument(
        "--cache-file", default="fss_companies_cache.csv",
        help="Filename for cached company data (default: fss_companies_cache.csv)",
    )
    parser.add_argument(
        "--regions", default=None,
        help="Comma-separated region filter (e.g., 'USA,GBR'). Default: all regions",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Enable debug logging",
    )
    return parser.parse_args()


def setup_logging(verbose: bool = False) -> logging.Logger:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    return logging.getLogger("company_sectors")


async def fetch_companies(api_key: str, logger: logging.Logger) -> list[dict]:
    """Pull all company codes from FSS via the SentimentClient."""
    async with SentimentClient(api_key=api_key) as client:
        logger.info("Fetching company taxonomy from FSS API...")
        companies = await client.get_companies()
        logger.info(f"Retrieved {len(companies)} company records")
        return companies


def save_cache(companies: list[dict], path: Path, logger: logging.Logger) -> None:
    df = pd.DataFrame(companies)
    df.to_csv(path, index=False, encoding="utf-8-sig")
    logger.info(f"Cached {len(df)} companies to {path.name}")


def load_cache(path: Path, logger: logging.Logger) -> list[dict]:
    if not path.exists():
        sys.exit(
            f"ERROR: Cache file not found: {path}\n"
            "Run without --skip-api first to fetch from the FSS API."
        )
    df = pd.read_csv(path, low_memory=False)
    logger.info(f"Loaded {len(df)} companies from cache: {path.name}")
    return df.to_dict(orient="records")


async def main() -> None:
    args = parse_args()
    logger = setup_logging(args.verbose)

    output_dir = Path(__file__).resolve().parent
    cache_path = output_dir / args.cache_file

    # Step 1: Get company data
    if args.skip_api:
        companies = load_cache(cache_path, logger)
    else:
        api_key = os.environ.get("FSS_API_KEY") or os.environ.get("FACTIVA_SENTIMENT_API_KEY", "")
        if not api_key:
            sys.exit(
                "ERROR: FSS_API_KEY or FACTIVA_SENTIMENT_API_KEY environment variable is required.\n"
                "Set it with: export FSS_API_KEY='your-key-here'\n"
                "Or use --skip-api to load from cached data."
            )
        companies = await fetch_companies(api_key, logger)
        save_cache(companies, cache_path, logger)

    # Step 2: Optional region filter
    if args.regions:
        regions = [r.strip() for r in args.regions.split(",")]
        companies = [c for c in companies if c.get("Region") in regions]
        logger.info(f"After region filter ({regions}): {len(companies)} companies")

    # Step 3: Extract unique industries and classify
    industries = set()
    for c in companies:
        ind = c.get("IndustryDescriptor", "")
        if ind and not pd.isna(ind):
            industries.add(str(ind))

    logger.info(f"Found {len(industries)} unique IndustryDescriptor values")

    industry_to_sector = {ind: classify_industry(ind) for ind in industries}
    industry_to_sub_sector = {
        ind: classify_sub_sector(industry_to_sector[ind], ind)
        for ind in industries
    }

    # Log "Other" industries
    others = sorted([ind for ind, sector in industry_to_sector.items() if sector == "Other"])
    if others:
        logger.warning(
            f"{len(others)} industries mapped to 'Other' (may need manual mapping):"
        )
        for ind in others:
            logger.warning(f"  - {ind}")

    # Step 4: Build output rows
    rows = []
    for c in companies:
        ind = str(c.get("IndustryDescriptor", "")) if not pd.isna(c.get("IndustryDescriptor")) else ""
        sector = industry_to_sector.get(ind, "Other")
        rows.append({
            "CompanyName": c.get("CompanyName", ""),
            "CompanyCode": c.get("_CompanyCode", ""),
            "Sector": sector,
            "SubSector": industry_to_sub_sector.get(ind, f"Other {sector}"),
            "Industry": ind,
            "Region": c.get("Region", ""),
            "Ticker": c.get("ExchangeTicker", ""),
            "Status": c.get("Status", ""),
            "ListStatus": c.get("ListStatus", ""),
        })

    df = pd.DataFrame(rows)

    # Step 5: Write company_sectors.csv
    output_path = output_dir / "company_sectors.csv"
    df.to_csv(output_path, index=False, encoding="utf-8-sig")
    logger.info(f"Wrote {len(df)} rows to {output_path.name}")

    # Step 5b: Write filtered CSVs by Status/ListStatus
    active_listed = df[(df["Status"] == "A") & (df["ListStatus"] == "L")]
    active_listed_path = output_dir / "company_sectors_active_listed.csv"
    active_listed.to_csv(active_listed_path, index=False, encoding="utf-8-sig")
    logger.info(f"Wrote {len(active_listed)} rows to {active_listed_path.name}")

    active_unlisted = df[(df["Status"] == "A") & (df["ListStatus"] == "UL")]
    active_unlisted_path = output_dir / "company_sectors_active_unlisted.csv"
    active_unlisted.to_csv(active_unlisted_path, index=False, encoding="utf-8-sig")
    logger.info(f"Wrote {len(active_unlisted)} rows to {active_unlisted_path.name}")

    # Step 5c: USA-only filtered CSVs
    usa_active_listed = active_listed[active_listed["Region"] == "USA"]
    usa_active_listed_path = output_dir / "company_sectors_usa_active_listed.csv"
    usa_active_listed.to_csv(usa_active_listed_path, index=False, encoding="utf-8-sig")
    logger.info(f"Wrote {len(usa_active_listed)} rows to {usa_active_listed_path.name}")

    usa_active_unlisted = active_unlisted[active_unlisted["Region"] == "USA"]
    usa_active_unlisted_path = output_dir / "company_sectors_usa_active_unlisted.csv"
    usa_active_unlisted.to_csv(usa_active_unlisted_path, index=False, encoding="utf-8-sig")
    logger.info(f"Wrote {len(usa_active_unlisted)} rows to {usa_active_unlisted_path.name}")

    # Step 6: Write sector_summary.csv (now includes sub-sector breakdown)
    all_sectors = [s for s, _ in SECTOR_KEYWORDS] + ["Other"]
    summary_rows = []
    for sector_name in all_sectors:
        sector_companies = df[df["Sector"] == sector_name]
        if len(sector_companies) == 0:
            continue
        sub_sectors = sorted(sector_companies["SubSector"].unique())
        for sub_sector_name in sub_sectors:
            sub_companies = sector_companies[sector_companies["SubSector"] == sub_sector_name]
            sub_industries = sorted(sub_companies["Industry"].unique())
            summary_rows.append({
                "Sector": sector_name,
                "SubSector": sub_sector_name,
                "CompanyCount": len(sub_companies),
                "IndustryCount": len(sub_industries),
                "Industries": "; ".join(sub_industries),
            })

    summary_df = pd.DataFrame(summary_rows)
    summary_path = output_dir / "sector_summary.csv"
    summary_df.to_csv(summary_path, index=False, encoding="utf-8-sig")
    logger.info(f"Wrote sector summary to {summary_path.name}")

    # Final report
    logger.info("--- Sector Distribution ---")
    sector_totals = df.groupby("Sector").size().reset_index(name="Count")
    for _, row in sector_totals.sort_values("Count", ascending=False).iterrows():
        sector_name = row["Sector"]
        sub_count = df[df["Sector"] == sector_name]["SubSector"].nunique()
        ind_count = df[df["Sector"] == sector_name]["Industry"].nunique()
        logger.info(
            f"  {sector_name}: {row['Count']} companies, "
            f"{sub_count} sub-sectors, {ind_count} industries"
        )
    logger.info("Done.")


if __name__ == "__main__":
    asyncio.run(main())
