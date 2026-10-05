/**
 * Revenue Analytics & Forecasting Engine
 * Pipeline health scoring, win/loss analysis, revenue forecasting
 * Direct impact on sales forecasting accuracy and deal execution
 */

export class RevenueAnalyticsEngine {
  constructor() {
    this.config = {
      defaultDealValue: 5000,
      salesCycleWeeks: 8,
      historicalWinRate: 0.25,
      advancedWinRate: 0.35,
    };
  }

  calculatePipelineHealth(deals) {
    if (!deals || deals.length === 0) return 0;

    const stageDistribution = this.analyzeStageDistribution(deals);
    const velocity = this.calculatePipelineVelocity(deals);
    const healthFactors = this.getHealthFactors(deals);

    const score =
      stageDistribution.healthScore * 0.40 +
      Math.min(100, velocity.score) * 0.35 +
      healthFactors.score * 0.25;

    return Math.min(100, Math.max(0, score));
  }

  analyzeStageDistribution(deals) {
    const stageWeights = {
      new: { weight: 0.05, value: 10 },
      prospecting: { weight: 0.10, value: 20 },
      contacted: { weight: 0.15, value: 30 },
      qualified: { weight: 0.25, value: 60 },
      proposal: { weight: 0.20, value: 80 },
      negotiation: { weight: 0.15, value: 90 },
      closed_won: { weight: 0.10, value: 100 },
      closed_lost: { weight: 0.0, value: 0 },
    };

    const stageCounts = {};

    for (const stage of Object.keys(stageWeights)) {
      stageCounts[stage] = deals.filter(
        (d) => (d.stage || "new").toLowerCase() === stage
      ).length;
    }

    const qualifiedCount =
      (stageCounts.qualified || 0) +
      (stageCounts.proposal || 0) +
      (stageCounts.negotiation || 0) +
      (stageCounts.closed_won || 0);
    const qualifiedPercent = (qualifiedCount / deals.length) * 100;

    const proposalCount =
      (stageCounts.proposal || 0) +
      (stageCounts.negotiation || 0) +
      (stageCounts.closed_won || 0);
    const proposalPercent = (proposalCount / deals.length) * 100;

    const negotiationCount =
      (stageCounts.negotiation || 0) + (stageCounts.closed_won || 0);
    const negotiationPercent = (negotiationCount / deals.length) * 100;

    let healthScore = 50;

    if (qualifiedPercent >= 25 && qualifiedPercent <= 50) healthScore += 15;
    else if (qualifiedPercent > 50) healthScore += 10;
    else if (qualifiedPercent < 15) healthScore -= 15;

    if (proposalPercent >= 10 && proposalPercent <= 20) healthScore += 15;
    if (negotiationPercent >= 5 && negotiationPercent <= 15) healthScore += 15;

    const closeRate = ((stageCounts.closed_won || 0) / deals.length) * 100;
    if (closeRate > 40) healthScore -= 10;

    return {
      stageCounts,
      qualifiedPercent,
      proposalPercent,
      negotiationPercent,
      healthScore: Math.min(100, Math.max(0, healthScore)),
    };
  }

  calculatePipelineVelocity(deals) {
    if (!deals || deals.length === 0)
      return { score: 0, description: "No deals" };

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const movedDeals = deals.filter((d) => {
      if (!d.lastStatusChangeAt) return false;
      const changeDate = new Date(d.lastStatusChangeAt);
      return changeDate >= thirtyDaysAgo;
    });

    const movementPercent = (movedDeals.length / deals.length) * 100;

    let score = 50;
    if (movementPercent >= 30 && movementPercent <= 40) {
      score = 85;
    } else if (movementPercent > 40) {
      score = 75;
    } else if (movementPercent < 20) {
      score = 40;
    } else {
      score = 60 + movementPercent / 2;
    }

    return {
      score: Math.min(100, score),
      movedDeals: movedDeals.length,
      movementPercent,
      interpretation:
        movementPercent > 35
          ? "Strong"
          : movementPercent > 20
            ? "Healthy"
            : "Slow",
    };
  }

  getHealthFactors(deals) {
    let score = 50;

    const avgDealSize =
      deals.reduce(
        (sum, d) => sum + (d.value || this.config.defaultDealValue),
        0
      ) / deals.length;
    if (avgDealSize > 10000) score += 15;
    if (avgDealSize < 2000) score -= 10;

    const stages = new Set(deals.map((d) => d.stage));
    if (stages.size >= 4) score += 10;
    if (stages.size <= 2) score -= 10;

    const replyingLeads = deals.filter((d) => d.replied).length;
    const replyRate = (replyingLeads / deals.length) * 100;
    if (replyRate >= 20) score += 15;
    if (replyRate < 5) score -= 15;

    return { score: Math.min(100, Math.max(0, score)) };
  }

  forecastRevenue(deals, timeframeWeeks = 12) {
    if (!deals || deals.length === 0)
      return { forecast: 0, conservative: 0, optimistic: 0 };

    const winProbabilities = {
      closed_won: 1.0,
      closed_lost: 0.0,
      negotiation: 0.7,
      proposal: 0.4,
      qualified: 0.15,
      contacted: 0.05,
      prospecting: 0.02,
      new: 0.01,
    };

    const closableDeals = deals.filter((d) => {
      const stage = (d.stage || "new").toLowerCase();
      return !stage.includes("closed");
    });

    let expectedRevenue = 0;
    let conservativeRevenue = 0;
    let optimisticRevenue = 0;

    for (const deal of closableDeals) {
      const value = deal.value || this.config.defaultDealValue;
      const stage = (deal.stage || "new").toLowerCase();
      const baseProbability = winProbabilities[stage] || 0.02;

      const scoreMultiplier = deal.leadScore ? (deal.leadScore / 100) * 1.2 : 1.0;
      const adjustedProbability = baseProbability * scoreMultiplier;

      const daysSinceUpdate = deal.lastStatusChangeAt
        ? (Date.now() - new Date(deal.lastStatusChangeAt).getTime()) /
          (1000 * 60 * 60 * 24)
        : 30;
      const timeDecay = Math.max(0.7, 1.0 - daysSinceUpdate / 90);

      const adjustedValue = value * adjustedProbability * timeDecay;

      expectedRevenue += adjustedValue;
      conservativeRevenue +=
        value * Math.max(0.3, adjustedProbability - 0.2) * timeDecay;
      optimisticRevenue +=
        value * Math.min(0.95, adjustedProbability + 0.2) * timeDecay;
    }

    const monthlyCycleAdjustment =
      (timeframeWeeks / 4) / this.config.salesCycleWeeks;

    return {
      forecast: Math.round(expectedRevenue * monthlyCycleAdjustment),
      conservative: Math.round(conservativeRevenue * monthlyCycleAdjustment),
      optimistic: Math.round(optimisticRevenue * monthlyCycleAdjustment),
      confidence: Math.min(
        100,
        50 +
          closableDeals.filter(
            (d) => (d.stage || "new").toLowerCase() !== "new"
          ).length * 3
      ),
      closableDealCount: closableDeals.length,
    };
  }

  analyzeWinLoss(deals) {
    const won = deals.filter(
      (d) => d.stage === "closed_won" || d.stage === "Closed Won"
    );
    const lost = deals.filter(
      (d) => d.stage === "closed_lost" || d.stage === "Closed Lost"
    );
    const active = deals.filter((d) => !d.stage?.toLowerCase().includes("closed"));

    const totalClosed = won.length + lost.length;
    const winRate = totalClosed > 0 ? (won.length / totalClosed) * 100 : 0;

    const wonValue = won.reduce(
      (sum, d) => sum + (d.value || this.config.defaultDealValue),
      0
    );
    const lostValue = lost.reduce(
      (sum, d) => sum + (d.value || this.config.defaultDealValue),
      0
    );
    const totalValue = wonValue + lostValue;
    const avgWonDealSize = won.length > 0 ? wonValue / won.length : 0;

    const lossReasons = {};
    lost.forEach((d) => {
      if (d.lossReason) {
        lossReasons[d.lossReason] = (lossReasons[d.lossReason] || 0) + 1;
      }
    });

    return {
      wonCount: won.length,
      lostCount: lost.length,
      activeCount: active.length,
      winRate: winRate.toFixed(1),
      wonValue: Math.round(wonValue),
      lostValue: Math.round(lostValue),
      avgWonDealSize: Math.round(avgWonDealSize),
      lossReasons,
      trend: this.getWinRateTrend(deals),
    };
  }

  getWinRateTrend(deals) {
    const now = new Date();
    const thisMonth = deals.filter((d) => {
      const closedDate = new Date(d.closedAt || Date.now());
      return (
        closedDate.getMonth() === now.getMonth() &&
        closedDate.getFullYear() === now.getFullYear() &&
        (d.stage === "closed_won" || d.stage === "closed_lost")
      );
    });

    const lastMonth = deals.filter((d) => {
      const closedDate = new Date(d.closedAt || Date.now());
      const lastMonthDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return (
        closedDate.getMonth() === lastMonthDate.getMonth() &&
        closedDate.getFullYear() === lastMonthDate.getFullYear() &&
        (d.stage === "closed_won" || d.stage === "closed_lost")
      );
    });

    const thisMonthWinRate =
      thisMonth.filter((d) => d.stage === "closed_won").length /
      Math.max(1, thisMonth.length);
    const lastMonthWinRate =
      lastMonth.filter((d) => d.stage === "closed_won").length /
      Math.max(1, lastMonth.length);

    return {
      thisMonth: (thisMonthWinRate * 100).toFixed(1),
      lastMonth: (lastMonthWinRate * 100).toFixed(1),
      trend: thisMonthWinRate > lastMonthWinRate ? "improving" : "declining",
      change: ((thisMonthWinRate - lastMonthWinRate) * 100).toFixed(1),
    };
  }

  identifyAtRiskDeals(deals) {
    const atRisk = [];

    for (const deal of deals) {
      let riskScore = 0;
      let reasons = [];

      if (deal.lastStatusChangeAt) {
        const daysSinceChange =
          (Date.now() - new Date(deal.lastStatusChangeAt).getTime()) /
          (1000 * 60 * 60 * 24);
        if (daysSinceChange > 30) {
          riskScore += 30;
          reasons.push("Stagnant for >30 days");
        }
      }

      if (!deal.replied && deal.stage === "contacted") {
        riskScore += 25;
        reasons.push("No reply from lead");
      }

      if (deal.stage === "proposal" || deal.stage === "negotiation") {
        if (deal.lastStatusChangeAt) {
          const daysSinceChange =
            (Date.now() - new Date(deal.lastStatusChangeAt).getTime()) /
            (1000 * 60 * 60 * 24);
          if (daysSinceChange > 21) {
            riskScore += 35;
            reasons.push("Extended in current stage");
          }
        }
      }

      if (!deal.replied && !deal.seemsInterested) {
        riskScore += 15;
        reasons.push("Low engagement signals");
      }

      if (riskScore >= 40) {
        atRisk.push({
          ...deal,
          riskScore,
          riskLevel:
            riskScore >= 70 ? "Critical" : riskScore >= 50 ? "High" : "Medium",
          reasons,
          recommendedAction:
            riskScore >= 70
              ? "Immediate intervention needed"
              : "Schedule follow-up",
        });
      }
    }

    return atRisk.sort((a, b) => b.riskScore - a.riskScore);
  }

  getActionItems(deals) {
    const actions = [];

    const health = this.calculatePipelineHealth(deals);
    if (health < 40) {
      actions.push({
        priority: "CRITICAL",
        action:
          "Review pipeline distribution - may have too many early-stage deals",
        impact: "Could improve forecast accuracy by 20-30%",
      });
    }

    const atRisk = this.identifyAtRiskDeals(deals);
    if (atRisk.length > deals.length * 0.3) {
      actions.push({
        priority: "HIGH",
        action: `${atRisk.length} deals at risk - initiate recovery plan`,
        impact: `Could save $${atRisk.reduce((sum, d) => sum + (d.value || this.config.defaultDealValue), 0).toLocaleString()} in potential revenue`,
      });
    }

    const velocity = this.calculatePipelineVelocity(deals);
    if (velocity.score < 50) {
      actions.push({
        priority: "HIGH",
        action: "Pipeline velocity is slow - accelerate stage transitions",
        impact: "Could compress sales cycle by 2-4 weeks",
      });
    }

    return actions.sort((a, b) => {
      const priorityMap = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
      return priorityMap[a.priority] - priorityMap[b.priority];
    });
  }
}

export const revenueAnalyticsEngine = new RevenueAnalyticsEngine();
