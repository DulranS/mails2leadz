// app/api/deal-pipeline/route.js
import { NextResponse } from "next/server";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc,
  getDoc,
  updateDoc,
  setDoc,
} from "firebase/firestore";

// ============================================================================
// FIREBASE CONFIGURATION WITH ERROR HANDLING
// ============================================================================
const requiredEnvVars = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

const missingEnvVars = requiredEnvVars.filter(
  (varName) => !process.env[varName],
);
if (missingEnvVars.length > 0) {
  console.error(
    "Missing required environment variables:",
    missingEnvVars.join(", "),
  );
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || "",
};

let app;
let db;

try {
  app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
  db = getFirestore(app);
} catch (error) {
  console.error("Firebase initialization error:", error);
}

// ============================================================================
// DEAL PIPELINE ANALYTICS
// ============================================================================
export async function POST(request) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  try {
    if (!app || !db) {
      return NextResponse.json(
        {
          error: "Firebase not properly initialized",
          details: "Missing or invalid Firebase configuration",
          code: "FIREBASE_ERROR",
        },
        { status: 500, headers },
      );
    }

    const { userId, action, data } = await request.json();

    if (!userId) {
      return NextResponse.json(
        {
          error: "Missing required parameter: userId",
          code: "MISSING_USER_ID",
        },
        { status: 400, headers },
      );
    }

    // Handle different pipeline actions
    switch (action) {
      case "comprehensive":
        return await handleComprehensivePipeline(userId, data);
      case "forecast":
        return await handleForecast(userId, data);
      case "stage-analysis":
        return await handleStageAnalysis(userId, data);
      default:
        return NextResponse.json(
          {
            error: `Unsupported pipeline action: ${action}`,
            code: "UNSUPPORTED_ACTION",
          },
          { status: 400, headers },
        );
    }
  } catch (error) {
    console.error("Deal pipeline error:", error);
    return NextResponse.json(
      {
        error: "Failed to process deal pipeline",
        details: error.message,
        code: "PIPELINE_ERROR",
      },
      { status: 500, headers },
    );
  }
}

// Handle comprehensive pipeline analysis
async function handleComprehensivePipeline(userId, data) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  try {
    // Get all deals for this user
    const dealsRef = collection(db, "deals");
    const q = query(
      dealsRef,
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
    );
    const snapshot = await getDocs(q);

    const deals = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        stage: data.stage || "new",
      };
    });

    // Calculate pipeline metrics
    const pipelineData = {
      totalDeals: deals.length,
      totalValue: deals.reduce((sum, deal) => sum + (deal.value || 0), 0),
      stageDistribution: {},
      conversionRates: {},
      forecast: {},
      suggestions: [],
    };

    // Calculate stage distribution
    const stageCounts = {};
    deals.forEach((deal) => {
      const stage = deal.stage || "new";
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    });

    pipelineData.stageDistribution = stageCounts;

    // Calculate conversion rates
    const totalDeals = deals.length;
    if (totalDeals > 0) {
      pipelineData.conversionRates = {
        new_to_contacted: (stageCounts["contacted"] || 0) / totalDeals,
        contacted_to_qualified:
          (stageCounts["qualified"] || 0) / (stageCounts["contacted"] || 1),
        qualified_to_demo:
          (stageCounts["demo"] || 0) / (stageCounts["qualified"] || 1),
        demo_to_proposal:
          (stageCounts["proposal"] || 0) / (stageCounts["demo"] || 1),
        proposal_to_closed:
          (stageCounts["closed_won"] || 0) / (stageCounts["proposal"] || 1),
        overall: (stageCounts["closed_won"] || 0) / totalDeals,
      };
    }

    // Calculate forecast
    const closedDeals = deals.filter((deal) => deal.stage === "closed_won");
    const avgDealValue =
      closedDeals.length > 0
        ? closedDeals.reduce((sum, deal) => sum + (deal.value || 0), 0) /
          closedDeals.length
        : 0;

    pipelineData.forecast = {
      avgDealValue: avgDealValue,
      expectedRevenue: {
        totalExpected: pipelineData.totalValue,
        next30Days: pipelineData.totalValue * 0.3,
        next90Days: pipelineData.totalValue * 0.7,
      },
      avgSalesCycleDays: 45, // Default estimate
    };

    // Generate suggestions
    if (pipelineData.totalValue < 10000) {
      pipelineData.suggestions.push({
        action: "Focus on higher-value deals",
        priority: "high",
        impact: "Significant revenue improvement",
      });
    }

    if (
      stageCounts["demo"] &&
      stageCounts["demo"] < (stageCounts["qualified"] || 0) * 0.3
    ) {
      pipelineData.suggestions.push({
        action: "Improve demo conversion rate",
        priority: "medium",
        impact: "Better pipeline progression",
      });
    }

    return NextResponse.json(
      {
        success: true,
        pipeline: pipelineData,
      },
      { headers },
    );
  } catch (error) {
    console.error("Pipeline analysis error:", error);
    return NextResponse.json(
      {
        error: "Failed to analyze pipeline",
        details: error.message,
      },
      { status: 500, headers },
    );
  }
}

// Handle forecast data
async function handleForecast(userId, data) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  try {
    const { targetDays = 90 } = data || {};

    // Get closed deals for revenue calculation
    const dealsRef = collection(db, "deals");
    const q = query(
      dealsRef,
      where("userId", "==", userId),
      where("stage", "==", "closed_won"),
    );
    const snapshot = await getDocs(q);

    const closedDeals = snapshot.docs.map((doc) => doc.data());

    // Calculate forecast
    const forecastData = {
      forecastedRevenue: 0,
      avgSalesCycleDays: 45,
      targetDays: targetDays,
    };

    if (closedDeals.length > 0) {
      const avgDealValue =
        closedDeals.reduce((sum, deal) => sum + (deal.value || 0), 0) /
        closedDeals.length;
      forecastData.forecastedRevenue = avgDealValue * closedDeals.length;
      forecastData.avgSalesCycleDays = 45; // Default
    }

    return NextResponse.json(
      {
        success: true,
        forecast: forecastData,
      },
      { headers },
    );
  } catch (error) {
    console.error("Forecast error:", error);
    return NextResponse.json(
      {
        error: "Failed to generate forecast",
        details: error.message,
      },
      { status: 500, headers },
    );
  }
}

// Handle stage analysis
async function handleStageAnalysis(userId, data) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  try {
    // Get deals by stage
    const dealsRef = collection(db, "deals");
    const q = query(dealsRef, where("userId", "==", userId));
    const snapshot = await getDocs(q);

    const deals = snapshot.docs.map((doc) => doc.data());

    const stageAnalysis = {};

    // Group by stage
    deals.forEach((deal) => {
      const stage = deal.stage || "new";
      if (!stageAnalysis[stage]) {
        stageAnalysis[stage] = {
          count: 0,
          totalValue: 0,
          averageValue: 0,
        };
      }
      stageAnalysis[stage].count += 1;
      stageAnalysis[stage].totalValue += deal.value || 0;
    });

    // Calculate averages
    Object.keys(stageAnalysis).forEach((stage) => {
      stageAnalysis[stage].averageValue =
        stageAnalysis[stage].count > 0
          ? stageAnalysis[stage].totalValue / stageAnalysis[stage].count
          : 0;
    });

    return NextResponse.json(
      {
        success: true,
        stageAnalysis: stageAnalysis,
      },
      { headers },
    );
  } catch (error) {
    console.error("Stage analysis error:", error);
    return NextResponse.json(
      {
        error: "Failed to analyze stages",
        details: error.message,
      },
      { status: 500, headers },
    );
  }
}
