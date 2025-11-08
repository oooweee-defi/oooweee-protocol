import React from 'react';

const TimeQuestAnimation = ({ daysRemaining, isDepositing }) => {
  return (
    <div className={`time-quest-visual ${isDepositing ? 'depositing' : ''}`}>
      <div className="piggy-bank-container">
        <div className="piggy-bank-body">
          <div className="piggy-snout"></div>
          <div className="piggy-ear"></div>
          <div className="piggy-tail"></div>
        </div>
        <div className="coin-slot"></div>
        <div className="coin-animation"></div>
      </div>
      <div className="calendar">
        <div className="calendar-top"></div>
        <div className="calendar-page">
          <span className="days-remaining">{daysRemaining}</span>
          <span className="days-label">days</span>
        </div>
      </div>
    </div>
  );
};

export default TimeQuestAnimation;
