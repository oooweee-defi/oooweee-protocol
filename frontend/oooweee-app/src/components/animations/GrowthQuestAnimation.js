import React from 'react';

const GrowthQuestAnimation = ({ progress, isDepositing }) => {
  const getPlantStage = () => {
    if (progress < 1) return 'seed';
    if (progress < 25) return 'seedling';
    if (progress < 75) return 'sapling';
    return 'tree';
  };

  const stage = getPlantStage();

  return (
    <div className={`growth-quest-visual ${isDepositing ? 'depositing' : ''}`}>
      <div className="pot">
        <div className="soil"></div>
      </div>
      <div className={`plant-growth ${stage}`}>
        <svg viewBox="0 0 100 100">
          {/* Seed */}
          <g className="seed-stage">
            <path d="M 50 90 a 5 5 0 0 1 0 -10 a 5 5 0 0 1 0 10" fill="#8B4513" />
          </g>
          {/* Seedling */}
          <g className="seedling-stage">
            <path className="stem" d="M 50 90 V 70" />
            <path className="leaf-left" d="M 50 75 C 40 70 40 60 50 65" />
            <path className="leaf-right" d="M 50 75 C 60 70 60 60 50 65" />
          </g>
          {/* Sapling */}
          <g className="sapling-stage">
            <path className="stem" d="M 50 90 V 50" />
            <path className="leaf-left" d="M 50 80 C 30 75 30 60 50 70" />
            <path className="leaf-right" d="M 50 80 C 70 75 70 60 50 70" />
            <path className="leaf-left" d="M 50 65 C 35 60 35 45 50 55" />
            <path className="leaf-right" d="M 50 65 C 65 60 65 45 50 55" />
          </g>
          {/* Tree */}
          <g className="tree-stage">
            <path className="trunk" d="M 52 90 V 40 H 48 V 90 Z" strokeWidth="3" fill="#8B4513" />
            <circle className="foliage" cx="50" cy="35" r="25" />
            <circle className="foliage" cx="35" cy="45" r="18" />
            <circle className="foliage" cx="65" cy="45" r="18" />
          </g>
        </svg>
      </div>
      <div className="watering-can">
        <div className="can-body"></div>
        <div className="can-spout"></div>
        <div className="can-handle"></div>
      </div>
      <div className="watering-animation">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="droplet" style={{'--i': i}}></div>
        ))}
      </div>
    </div>
  );
};

export default GrowthQuestAnimation;
