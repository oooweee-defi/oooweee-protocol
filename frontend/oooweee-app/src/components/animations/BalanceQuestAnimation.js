import React from 'react';

const BalanceQuestAnimation = ({ progress, isDepositing }) => {
  const getScaleRotation = () => {
    const rotation = (progress - 50) * 0.2;
    return Math.max(-15, Math.min(15, rotation));
  };

  return (
    <div className={`balance-quest-visual ${isDepositing ? 'depositing' : ''}`}>
      <div className="scale-stand"></div>
      <div className="scale-beam" style={{ transform: `rotate(${getScaleRotation()}deg)` }}>
        <div className="pan-container left">
          <div className="pan-rope"></div>
          <div className="pan">
            <div className="package-icon">📦</div>
          </div>
        </div>
        <div className="pan-container right">
          <div className="pan-rope"></div>
          <div className="pan">
            <div className="coin-stack">
              {[...Array(Math.min(10, Math.floor(progress / 10)))].map((_, i) => (
                <div key={i} className="coin" style={{'--i': i}}></div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="coin-drop-animation"></div>
    </div>
  );
};

export default BalanceQuestAnimation;
