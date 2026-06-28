// app/api/deals/route.js
import { NextResponse } from "next/server";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
} from "firebase/firestore";
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
// DEAL STAGES
// ============================================================================
const DEAL_STAGES = [
  "new",
  "contacted",
  "qualified",
  "demo",
  "proposal",
  "closed_won",
  "closed_lost",
];

// ============================================================================
// POST HANDLER - Create or update deal
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

    const { email, userId, stage, value, notes, metadata } =
      await request.json();

    if (!email || !userId) {
      return NextResponse.json(
        {
          error: "Missing required fields: email and userId",
          code: "MISSING_FIELDS",
        },
        { status: 400, headers },
      );
    }

    // Validate deal stage
    if (stage && !DEAL_STAGES.includes(stage)) {
      return NextResponse.json(
        {
          error: `Invalid deal stage. Valid stages: ${DEAL_STAGES.join(", ")}`,
          code: "INVALID_STAGE",
        },
        { status: 400, headers },
      );
    }

    // Create or update deal
    const dealId = `${userId}_${email}`;
    const dealRef = doc(db, "deals", dealId);

    const dealData = {
      email,
      userId,
      stage: stage || "new",
      value: value || 0,
      notes: notes || [],
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const dealSnap = await getDoc(dealRef);
    if (dealSnap.exists()) {
      await updateDoc(dealRef, {
        ...dealData,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await setDoc(dealRef, dealData);
    }

    return NextResponse.json(
      {
        success: true,
        deal: {
          id: dealId,
          ...dealData,
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("Deal creation/update error:", error);
    return NextResponse.json(
      {
        error: "Failed to create/update deal",
        details: error.message,
        code: "DEAL_ERROR",
      },
      { status: 500, headers },
    );
  }
}

// ============================================================================
// GET HANDLER - Get deals for user
// ============================================================================
export async function GET(request) {
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

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const stage = searchParams.get("stage");
    const limitParam = searchParams.get("limit") || 50;

    if (!userId) {
      return NextResponse.json(
        {
          error: "Missing required parameter: userId",
          code: "MISSING_USER_ID",
        },
        { status: 400, headers },
      );
    }

    // Build query
    let q = query(
      collection(db, "deals"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(parseInt(limitParam)),
    );

    // Apply stage filter if provided
    if (stage && DEAL_STAGES.includes(stage)) {
      q = query(q, where("stage", "==", stage));
    }

    const snapshot = await getDocs(q);

    const deals = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json(
      {
        success: true,
        deals,
        count: deals.length,
      },
      { headers },
    );
  } catch (error) {
    console.error("Deal retrieval error:", error);
    return NextResponse.json(
      {
        error: "Failed to retrieve deals",
        details: error.message,
        code: "DEAL_ERROR",
      },
      { status: 500, headers },
    );
  }
}

// ============================================================================
// PUT HANDLER - Update deal stage
// ============================================================================
export async function PUT(request) {
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

    const { dealId, stage, value, notes } = await request.json();

    if (!dealId) {
      return NextResponse.json(
        { error: "Missing required field: dealId", code: "MISSING_DEAL_ID" },
        { status: 400, headers },
      );
    }

    // Validate deal stage
    if (stage && !DEAL_STAGES.includes(stage)) {
      return NextResponse.json(
        {
          error: `Invalid deal stage. Valid stages: ${DEAL_STAGES.join(", ")}`,
          code: "INVALID_STAGE",
        },
        { status: 400, headers },
      );
    }

    // Get existing deal
    const dealRef = doc(db, "deals", dealId);
    const dealSnap = await getDoc(dealRef);

    if (!dealSnap.exists()) {
      return NextResponse.json(
        { error: "Deal not found", code: "DEAL_NOT_FOUND" },
        { status: 404, headers },
      );
    }

    const dealData = dealSnap.data();

    // Update deal
    const updateData = {
      updatedAt: new Date().toISOString(),
    };

    if (stage) updateData.stage = stage;
    if (value !== undefined) updateData.value = value;
    if (notes) updateData.notes = notes;

    await updateDoc(dealRef, updateData);

    return NextResponse.json(
      {
        success: true,
        deal: {
          id: dealId,
          ...dealData,
          ...updateData,
        },
      },
      { headers },
    );
  } catch (error) {
    console.error("Deal update error:", error);
    return NextResponse.json(
      {
        error: "Failed to update deal",
        details: error.message,
        code: "DEAL_ERROR",
      },
      { status: 500, headers },
    );
  }
}

// ============================================================================
// DELETE HANDLER - Delete deal
// ============================================================================
export async function DELETE(request) {
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

    const { dealId } = await request.json();

    if (!dealId) {
      return NextResponse.json(
        { error: "Missing required field: dealId", code: "MISSING_DEAL_ID" },
        { status: 400, headers },
      );
    }

    // Delete deal
    const dealRef = doc(db, "deals", dealId);
    await deleteDoc(dealRef);

    return NextResponse.json(
      {
        success: true,
        message: "Deal deleted successfully",
      },
      { headers,
    );
  } catch (error) {
    console.error("Deal deletion error:", error);
    return NextResponse.json(
      {
        error: "Failed to delete deal",
        details: error.message,
        code: "DEAL_ERROR",
      },
      { status: 500, headers },
    );
  }
}

// ============================================================================
// PATCH HANDLER - Update deal stage (e.g., mark as CLOSED)
// ============================================================================
export async function PATCH(request) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  try {
    if (!app || !db) {
      return NextResponse.json(
        { error: "Firebase not properly initialized", code: "FIREBASE_ERROR" },
        { status: 500, headers },
      );
    }

    const { dealId, stage, ...updates } = await request.json();

    if (!dealId) {
      return NextResponse.json(
        { error: "Missing required field: dealId", code: "MISSING_DEAL_ID" },
        { status: 400, headers },
      );
    }

    if (stage && !DEAL_STAGES.includes(stage)) {
      return NextResponse.json(
        { error: `Invalid deal stage: ${stage}`, code: "INVALID_STAGE" },
        { status: 400, headers },
      );
    }

    const dealRef = doc(db, "deals", dealId);
    const updateData = {
      ...updates,
      stage: stage || "closed_won",
      updatedAt: new Date().toISOString(),
    };

    await updateDoc(dealRef, updateData);

    return NextResponse.json(
      { success: true, dealId, updatedFields: updateData },
      { headers },
    );
  } catch (error) {
    console.error("Deal update error:", error);
    return NextResponse.json(
      { error: "Failed to update deal", details: error.message, code: "DEAL_ERROR" },
      { status: 500, headers },
    );
  }
}
