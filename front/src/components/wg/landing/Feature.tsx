import React from "react";
import Image from "next/image";
import { Cpu, Gauge, Target, Leaf, BookOpen, Sprout, Zap } from "lucide-react";
import "./Feature.css";

/**
 * WheatGuard AI — Features section.
 * Compact cards: icon + title header, then a short paragraph beside a small
 * visual. Photo cards use <Image> inside .card-image; the speed and confidence
 * cards are pure CSS. Class names here match Feature.css exactly.
 * Exposed as #features so the landing navbar link scrolls here.
 */

const Feature = () => {
  return (
    <section id="features" className="features-section">
      <div className="features-container">
        {/* Badge */}
        <div className="feature-badge">
          <Sprout size={15} />
          <span>POWERFUL FEATURES</span>
        </div>

        {/* Heading */}
        <h2 className="features-title">
          Everything You Need to <span>Protect Your Wheat</span>
        </h2>

        <p className="features-subtitle">
          Smart tools that turn a simple wheat leaf image into useful crop-health insights.
        </p>

        {/* Features Grid */}
        <div className="features-grid">
          {/* 1. AI Detection */}
          <div className="feature-card">
            <div className="card-header">
              <div className="icon-box">
                <Cpu size={23} />
              </div>
              <h3>
                AI-Powered
                <br />
                Detection
              </h3>
            </div>

            <div className="card-content">
              <p>
                Upload a wheat leaf image and let our advanced AI identify potential disease
                patterns with high accuracy.
              </p>
              <div className="card-image">
                <Image
                  src="/images/feature-detection.jpg"
                  alt="AI scanning a rust-infected wheat leaf"
                  fill
                  sizes="(max-width: 650px) 90px, 105px"
                />
              </div>
            </div>
          </div>

          {/* 2. Results in Seconds */}
          <div className="feature-card">
            <div className="card-header">
              <div className="icon-box">
                <Gauge size={23} />
              </div>
              <h3>
                Results in
                <br />
                Seconds
              </h3>
            </div>

            <div className="card-content">
              <p>
                Get fast and reliable results in just a few seconds, so you can take action sooner.
              </p>
              <div className="speed-visual">
                <div className="speed-circle">
                  <div className="speed-content">
                    <strong>3s</strong>
                    <small>RESULT</small>
                  </div>
                </div>
                <div className="bolt">
                  <Zap size={17} fill="white" />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Prediction Confidence */}
          <div className="feature-card">
            <div className="card-header">
              <div className="icon-box">
                <Target size={23} />
              </div>
              <h3>
                Prediction
                <br />
                Confidence
              </h3>
            </div>

            <div className="card-content">
              <p>
                View the AI model&apos;s confidence score with every prediction for better
                understanding.
              </p>
              <div className="confidence-visual">
                <div className="confidence-ring">
                  <span>94%</span>
                </div>
                <small>High Confidence</small>
              </div>
            </div>
          </div>

          {/* 4. Actionable Recommendations */}
          <div className="feature-card">
            <div className="card-header">
              <div className="icon-box">
                <Leaf size={23} />
              </div>
              <h3>
                Actionable
                <br />
                Recommendations
              </h3>
            </div>

            <div className="card-content">
              <p>
                Receive practical and actionable recommendations to help manage and protect your
                wheat crops.
              </p>
              <div className="card-image">
                <Image
                  src="/images/feature-recommendations.png"
                  alt="Wheat leaf with an actionable recommendation check"
                  fill
                  sizes="(max-width: 650px) 90px, 105px"
                />
              </div>
            </div>
          </div>

          {/* 5. Wheat Disease Library */}
          <div className="feature-card">
            <div className="card-header">
              <div className="icon-box">
                <BookOpen size={23} />
              </div>
              <h3>
                Wheat Disease
                <br />
                Library
              </h3>
            </div>

            <div className="card-content">
              <p>
                Explore a comprehensive library of wheat diseases with symptoms, causes, and
                prevention tips.
              </p>
              <div className="card-image card-image--contain">
                <Image
                  src="/images/feature-disease-library.png"
                  alt="Open wheat disease library book with symptom photos"
                  fill
                  sizes="(max-width: 650px) 90px, 105px"
                />
              </div>
            </div>
          </div>

          {/* 6. Healthier Crops */}
          <div className="feature-card">
            <div className="card-header">
              <div className="icon-box">
                <Sprout size={23} />
              </div>
              <h3>
                Healthier
                <br />
                Crops
              </h3>
            </div>

            <div className="card-content">
              <p>
                Early detection leads to better decisions, healthier crops, higher yields, and
                increased productivity.
              </p>
              <div className="card-image">
                <Image
                  src="/images/feature-healthier-crops.jpg"
                  alt="Healthy green wheat ears in a field"
                  fill
                  sizes="(max-width: 650px) 90px, 105px"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Feature;
