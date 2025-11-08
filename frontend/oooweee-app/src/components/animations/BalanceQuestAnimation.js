import React from 'react';

const BalanceQuestAnimation = ({ progress, isDepositing }) => {
  const getScaleRotation = () => {
    // Make the scale tilt more dramatically
    const rotation = (progress - 50) * 0.4;
    return Math.max(-25, Math.min(25, rotation));
  };

  const coinCount = Math.min(10, Math.floor(progress / 10));

  return (
    <div className={`balance-quest-visual ${isDepositing ? 'depositing' : ''}`}>
      <div className="scale-stand"></div>
      <div className="scale-beam" style={{ transform: `translateX(-50%) rotate(${getScaleRotation()}deg)` }}>
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
              {[...Array(coinCount)].map((_, i) => (
                <div key={i} className="coin" style={{'--i': i}}></div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {isDepositing && <div className="coin-drop-animation"></div>}
    </div>
  );
};

export default BalanceQuestAnimation;
