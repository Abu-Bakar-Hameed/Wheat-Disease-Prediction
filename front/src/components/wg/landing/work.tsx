"use client";

import React from "react";
import {
  Settings,
  Upload,
  ScanLine,
  Search,
  Sprout,
  ShieldCheck,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Leaf,
  Check,
  Zap,
  Target,
  BarChart3,
} from "lucide-react";

/**
 * WheatGuard AI — "How It Works" section (matches assets/images/work.png).
 * Four numbered workflow cards (Upload → Analyze → Predict → Understand & Act),
 * each with a photo cropped from the mockup, plus a bottom "Simple. Fast.
 * Reliable." feature band. Uses lucide-react icons (project convention) and
 * styled-jsx for the scoped layout. Exposed as #how-it-works for the navbar.
 */

export default function Work() {
  return (
    <>
      <style jsx>{`
        .how-it-works {
          width: 100%;
          padding: 44px 0 40px;
          background:
            radial-gradient(circle at 50% 55%, rgba(220, 245, 228, 0.3), transparent 46%),
            #ffffff;
          overflow: hidden;
          font-family: "Inter", Arial, sans-serif;
          color: #17201b;
        }
        .container {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto;
          padding: 0 24px;
        }
        @media (min-width: 1024px) {
          .container {
            padding: 0 40px;
          }
        }

        .section-badge {
          width: fit-content;
          margin: 0 auto 10px;
          padding: 6px 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-radius: 30px;
          background: #eff8f1;
          color: #287c43;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.2px;
        }
        .section-title {
          text-align: center;
          margin: 0 0 6px;
          color: #111a15;
          font-size: clamp(29px, 4vw, 40px);
          line-height: 1.1;
          font-weight: 800;
          letter-spacing: -1.6px;
        }
        .section-title span { color: #19763e; }
        .section-subtitle {
          text-align: center;
          margin: 0 0 28px;
          color: #7b8580;
          font-size: 13px;
          line-height: 1.5;
        }

        .workflow { width: 100%; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .workflow-step { position: relative; min-width: 0; }
        .step-top { width: 100%; height: 30px; display: flex; align-items: center; position: relative; }
        .step-number {
          width: 24px; height: 24px; flex-shrink: 0;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: #238344; color: #ffffff;
          font-size: 10px; font-weight: 700;
          box-shadow: 0 3px 8px rgba(35, 131, 68, 0.17);
          position: relative; z-index: 5;
        }
        .connection {
          position: absolute; left: 24px; right: -8px; top: 12px; height: 1px;
          border-top: 1px dashed #a4d3b2;
        }
        .connection::after {
          content: ""; position: absolute; right: 0; top: -4px;
          width: 7px; height: 7px;
          border-top: 1px solid #45955f; border-right: 1px solid #45955f;
          transform: rotate(45deg);
        }
        .workflow-step:last-child .connection { display: none; }

        .step-card {
          width: 100%; min-height: 236px; padding: 13px;
          display: flex; flex-direction: column; overflow: hidden;
          border-radius: 12px; border: 1px solid #e9efeb;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 7px 24px rgba(31, 73, 45, 0.065), 0 1px 3px rgba(31, 73, 45, 0.04);
          transition: transform 0.25s ease, box-shadow 0.25s ease;
        }
        .step-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(31, 73, 45, 0.09), 0 2px 5px rgba(31, 73, 45, 0.05);
        }
        .card-header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; flex-shrink: 0; }
        .card-icon {
          width: 40px; height: 40px; min-width: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          background: #f0f8f2; color: #319451;
        }
        .card-title { margin: 0 0 3px; color: #1c261f; font-size: 13px; line-height: 1.25; font-weight: 800; }
        .card-title .green { display: block; color: #258344; }
        .card-description { margin: 0; color: #727c75; font-size: 11px; line-height: 1.5; }

        .card-image, .prediction-image {
          width: 100%; height: 108px; margin-top: auto; overflow: hidden;
          border-radius: 8px; background: #f4f8f5;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .card-image img, .prediction-image img {
          width: 100%; height: 100%; display: block; object-fit: cover; object-position: center;
        }

        .result-preview {
          width: 100%; height: 108px; margin-top: auto; padding: 9px; overflow: hidden;
          border-radius: 9px; border: 1px solid #edf1ee; background: #ffffff; flex-shrink: 0;
        }
        .result-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .result-image {
          width: 40px; height: 36px; min-width: 40px; overflow: hidden;
          border-radius: 6px; background: #5d993c;
        }
        .result-image img { width: 100%; height: 100%; display: block; object-fit: cover; object-position: center; }
        .result-name { color: #202821; font-size: 11px; font-weight: 700; }
        .detected {
          display: inline-block; margin-top: 3px; padding: 2px 6px; border-radius: 4px;
          background: #ffeaea; color: #d85353; font-size: 8px; font-weight: 600;
        }
        .result-confidence {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 4px; color: #5c665f; font-size: 10px;
        }
        .result-confidence strong { color: #35423a; font-weight: 700; }
        .progress-bar {
          width: 100%; height: 5px; margin-bottom: 8px; overflow: hidden;
          border-radius: 20px; background: #e7ede9;
        }
        .progress-value { width: 94%; height: 100%; border-radius: inherit; background: #369151; }
        .report-button {
          width: 100%; height: 26px; padding: 0; border: none; border-radius: 6px;
          background: #218342; color: #ffffff; font-size: 10px; font-weight: 600; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 5px;
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .report-button:hover { background: #176b35; transform: translateY(-1px); }

        .status-badge {
          width: fit-content; margin: 10px auto 0; padding: 6px 11px;
          display: flex; align-items: center; gap: 6px;
          border-radius: 30px; background: #f1f8f3; color: #506359;
          font-size: 10px; font-weight: 500;
        }
        .status-badge svg { color: #2b914b; }

        .features {
          width: 100%; margin-top: 20px; padding: 16px 22px;
          display: grid; grid-template-columns: 1.35fr repeat(4, 1fr); align-items: center;
          border-radius: 14px; border: 1px solid #edf2ee;
          background: linear-gradient(100deg, #f8fbf8, #f5faf6);
          box-shadow: 0 5px 20px rgba(25, 74, 40, 0.035);
        }
        .feature-intro { display: flex; align-items: center; gap: 12px; padding-right: 18px; }
        .intro-icon {
          width: 46px; height: 46px; min-width: 46px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: #e8f6eb; color: #238442; position: relative;
        }
        .intro-icon::after {
          content: ""; position: absolute; inset: 5px;
          border: 1px solid #8bc79b; border-radius: 50%;
        }
        .feature-intro h3 { margin: 0 0 4px; color: #202a23; font-size: 14px; font-weight: 800; }
        .feature-intro p { max-width: 200px; margin: 0; color: #727d76; font-size: 11px; line-height: 1.5; }
        .feature-item {
          min-height: 48px; padding: 2px 14px; display: flex; align-items: flex-start; gap: 10px;
          border-left: 1px dashed #d6e3d9;
        }
        .feature-icon {
          width: 30px; height: 30px; min-width: 30px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          background: #eaf6ed; color: #278948;
        }
        .feature-item h4 { margin: 0 0 3px; color: #2b342e; font-size: 11px; font-weight: 800; }
        .feature-item p { margin: 0; color: #7a837d; font-size: 10px; line-height: 1.45; }

        /* Dark theme — toggled by the navbar button (.dark on <html>) */
        :global(.dark) .how-it-works {
          background:
            radial-gradient(circle at 50% 55%, rgba(34, 197, 94, 0.08), transparent 46%),
            #071410;
        }
        :global(.dark) .section-badge { background: rgba(34, 197, 94, 0.14); color: #86efac; }
        :global(.dark) .section-title { color: #f1f7f2; }
        :global(.dark) .section-title span { color: #4ade80; }
        :global(.dark) .section-subtitle { color: #9db0a4; }
        :global(.dark) .step-card { background: #0d2018; border-color: rgba(255, 255, 255, 0.08); box-shadow: 0 7px 24px rgba(0, 0, 0, 0.4); }
        :global(.dark) .step-card:hover { box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5); }
        :global(.dark) .card-title { color: #e8f1ea; }
        :global(.dark) .card-title .green { color: #4ade80; }
        :global(.dark) .card-description { color: #9db0a4; }
        :global(.dark) .card-icon { background: rgba(34, 197, 94, 0.14); color: #4ade80; }
        :global(.dark) .connection { border-top-color: rgba(255, 255, 255, 0.18); }
        :global(.dark) .connection::after { border-top-color: rgba(255, 255, 255, 0.35); border-right-color: rgba(255, 255, 255, 0.35); }
        :global(.dark) .status-badge { background: rgba(255, 255, 255, 0.06); color: #9db0a4; }
        :global(.dark) .result-preview { background: #0d2018; border-color: rgba(255, 255, 255, 0.08); }
        :global(.dark) .result-name { color: #e8f1ea; }
        :global(.dark) .result-confidence { color: #9db0a4; }
        :global(.dark) .result-confidence strong { color: #e8f1ea; }
        :global(.dark) .progress-bar { background: rgba(255, 255, 255, 0.1); }
        :global(.dark) .features { background: linear-gradient(100deg, #0d2018, #0b1b14); border-color: rgba(255, 255, 255, 0.08); }
        :global(.dark) .feature-intro h3 { color: #e8f1ea; }
        :global(.dark) .feature-intro p { color: #9db0a4; }
        :global(.dark) .intro-icon { background: rgba(34, 197, 94, 0.14); color: #4ade80; }
        :global(.dark) .intro-icon::after { border-color: rgba(74, 222, 128, 0.4); }
        :global(.dark) .feature-icon { background: rgba(34, 197, 94, 0.14); color: #4ade80; }
        :global(.dark) .feature-item { border-left-color: rgba(255, 255, 255, 0.14); }
        :global(.dark) .feature-item h4 { color: #e8f1ea; }
        :global(.dark) .feature-item p { color: #9db0a4; }

        @media (max-width: 950px) {
          .workflow { grid-template-columns: repeat(2, 1fr); row-gap: 20px; }
          .connection { display: none; }
          .features { grid-template-columns: repeat(2, 1fr); gap: 15px; }
          .feature-intro { grid-column: 1 / -1; }
          .feature-item { border-left: none; border-top: 1px dashed #d6e3d9; padding-top: 12px; }
        }
        @media (max-width: 600px) {
          .how-it-works { padding: 32px 14px 28px; }
          .section-title { font-size: 28px; letter-spacing: -1px; }
          .section-subtitle { font-size: 12px; margin-bottom: 22px; }
          .workflow { grid-template-columns: 1fr; gap: 22px; }
          .step-card { min-height: auto; }
          .card-image, .prediction-image, .result-preview { height: 132px; }
          .features { grid-template-columns: 1fr; padding: 16px; }
          .feature-intro { grid-column: auto; }
          .feature-item { padding: 12px 0 0; border-top: 1px dashed #d6e3d9; border-left: none; }
          .feature-item:first-of-type { border-top: none; }
        }
      `}</style>

      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <div className="section-badge">
            <Settings size={12} aria-hidden="true" />
            HOW IT WORKS
          </div>

          <h2 className="section-title">
            From Leaf Image to<span> AI Insight</span>
          </h2>

          <p className="section-subtitle">
            A simple four-step workflow for accurate wheat disease detection.
          </p>

          <div className="workflow">
            {/* STEP 01 */}
            <div className="workflow-step">
              <div className="step-top">
                <div className="step-number">01</div>
                <div className="connection"></div>
              </div>
              <div className="step-card">
                <div className="card-header">
                  <div className="card-icon">
                    <Upload size={20} aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="card-title">
                      Upload<span className="green">Upload a Leaf Image</span>
                    </h3>
                    <p className="card-description">Take or select a clear photo of a wheat leaf.</p>
                  </div>
                </div>
                <div className="card-image">
                  <img src="/images/work-1.jpg" alt="Hand holding a phone photographing a wheat leaf" />
                </div>
              </div>
              <div className="status-badge">
                <ShieldCheck size={12} aria-hidden="true" />
                Image captured
              </div>
            </div>

            {/* STEP 02 */}
            <div className="workflow-step">
              <div className="step-top">
                <div className="step-number">02</div>
                <div className="connection"></div>
              </div>
              <div className="step-card">
                <div className="card-header">
                  <div className="card-icon">
                    <ScanLine size={20} aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="card-title">
                      Analyze<span className="green">AI Analyzes the Image</span>
                    </h3>
                    <p className="card-description">
                      WheatGuard AI processes the image and analyzes visible patterns.
                    </p>
                  </div>
                </div>
                <div className="card-image">
                  <img src="/images/work-2.jpg" alt="Green wheat leaf with an AI circuit overlay" />
                </div>
              </div>
              <div className="status-badge">
                <RefreshCw size={12} aria-hidden="true" />
                Analyzing patterns...
              </div>
            </div>

            {/* STEP 03 */}
            <div className="workflow-step">
              <div className="step-top">
                <div className="step-number">03</div>
                <div className="connection"></div>
              </div>
              <div className="step-card">
                <div className="card-header">
                  <div className="card-icon">
                    <Search size={20} aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="card-title">
                      Predict<span className="green">Disease Prediction</span>
                    </h3>
                    <p className="card-description">
                      The system identifies the most likely disease with a confidence score.
                    </p>
                  </div>
                </div>
                <div className="prediction-image">
                  <img src="/images/work-3.jpg" alt="Rust-infected wheat leaf with a 94% confidence ring" />
                </div>
              </div>
              <div className="status-badge">
                <CheckCircle2 size={12} aria-hidden="true" />
                Prediction complete
              </div>
            </div>

            {/* STEP 04 */}
            <div className="workflow-step">
              <div className="step-top">
                <div className="step-number">04</div>
              </div>
              <div className="step-card">
                <div className="card-header">
                  <div className="card-icon">
                    <Sprout size={20} aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="card-title">
                      Understand<span className="green">&amp; Act</span>
                    </h3>
                    <p className="card-description">Review the results.</p>
                  </div>
                </div>
                <div className="result-preview">
                  <div className="result-top">
                    <div className="result-image">
                      <img src="/images/feature-detection.jpg" alt="Leaf rust detection result" />
                    </div>
                    <div>
                      <div className="result-name">Leaf Rust</div>
                      <span className="detected">Detected</span>
                    </div>
                  </div>
                  <div className="result-confidence">
                    <span>Confidence</span>
                    <strong>94%</strong>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-value"></div>
                  </div>
                  <button type="button" className="report-button">
                    View Full Report
                    <ArrowRight size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="status-badge">
                <Leaf size={12} aria-hidden="true" />
                Take action
              </div>
            </div>
          </div>

          {/* BOTTOM FEATURES */}
          <div className="features">
            <div className="feature-intro">
              <div className="intro-icon">
                <Check size={20} aria-hidden="true" />
              </div>
              <div>
                <h3>Simple. Fast. Reliable.</h3>
                <p>
                  WheatGuard AI makes disease detection easy with a streamlined process powered by
                  advanced AI technology.
                </p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <Zap size={15} aria-hidden="true" />
              </div>
              <div>
                <h4>Fast Results</h4>
                <p>Get insights in seconds</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <Target size={15} aria-hidden="true" />
              </div>
              <div>
                <h4>High Accuracy</h4>
                <p>AI-powered precision detection</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <ShieldCheck size={15} aria-hidden="true" />
              </div>
              <div>
                <h4>Easy to Use</h4>
                <p>Designed for farmers and experts</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <BarChart3 size={15} aria-hidden="true" />
              </div>
              <div>
                <h4>Actionable Insights</h4>
                <p>Get recommendations you can trust</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
