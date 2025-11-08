import React from 'react';

const GrowthQuestAnimation = ({ progress, isDepositing }) => {
  const getPlantStage = () => {
    if (progress < 10) return 'seed';
    if (progress < 40) return 'seedling';
    if (progress < 80) return 'sapling';
    return 'tree';
  };

  return (
    <div className={`growth-quest-visual ${isDepositing ? 'depositing' : ''}`}>
      <div className="pot">
        <div className="soil"></div>
      </div>
      <div className={`plant-growth ${getPlantStage()}`}>
        <svg viewBox="0 0 100 100">
          {/* Seed */}
          <g className="seed-stage">
            <path d="M 50 80 a 10 10 0 0 1 0 -20 a 10 10 0 0 1 0 20" />
          </g>
          {/* Seedling */}
          <g className="seedling-stage">
            <path className="stem" d="M 50 80 V 60" />
            <path className="leaf-left" d="M 50 65 C 40 60 40 50 50 55" />
            <path className="leaf-right" d="M 50 65 C 60 60 60 50 50 55" />
          </g>
          {/* Sapling */}
          <g className="sapling-stage">
            <path className="stem" d="M 50 80 V 40" />
            <path className="leaf-left" d="M 50 70 C 30 65 30 50 50 60" />
            <path className="leaf-right" d="M 50 70 C 70 65 70 50 50 60" />
            <path className="leaf-left" d="M 50 55 C 35 50 35 35 50 45" />
            <path className="leaf-right" d="M 50 55 C 65 50 65 35 50 45" />
          </g>
          {/* Tree */}
          <g className="tree-stage">
            <path className="trunk" d="M 52 80 V 30 H 48 V 80 Z" />
            <circle className="foliage" cx="50" cy="25" r="20" />
            <circle className="foliage" cx="40" cy="35" r="15" />
            <circle className="foliage" cx="60" cy="35" r="15" />
          </g>
        </svg>
      </div>
      <div className="watering-animation">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="droplet" style={{'--i': i}}></div>
        ))}
      </div>
    </div>
  );
};

export default GrowthQuestAnimation;
