#!/bin/bash

# OOOWEEE Protocol Quick Redeploy Script
# For users with existing .env and public RPC setup

echo "🚀 OOOWEEE Protocol Quick Redeployment"
echo "======================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Backup check
echo -e "${YELLOW}Step 1: Backing up current deployment...${NC}"
if [ -f "deployment-sepolia.json" ]; then
    BACKUP_NAME="deployment-sepolia-backup-$(date +%Y%m%d-%H%M%S).json"
    cp deployment-sepolia.json $BACKUP_NAME
    echo -e "${GREEN}✅ Backed up to: $BACKUP_NAME${NC}"
else
    echo -e "${YELLOW}⚠️  No existing deployment-sepolia.json found${NC}"
fi

# Step 2: Check .env exists
echo ""
echo -e "${YELLOW}Step 2: Checking environment...${NC}"
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found!${NC}"
    echo "Please ensure .env exists with:"
    echo "  PRIVATE_KEY=your_test_private_key"
    echo "  SEPOLIA_RPC_URL=https://rpc.sepolia.org"
    exit 1
fi
echo -e "${GREEN}✅ .env file found${NC}"

# Step 3: Copy scripts
echo ""
echo -e "${YELLOW}Step 3: Setting up scripts...${NC}"
mkdir -p scripts
cp deploy-v2.js scripts/ 2>/dev/null || echo "  deploy-v2.js already in place"
cp post-deploy-setup.js scripts/ 2>/dev/null || echo "  post-deploy-setup.js already in place"
cp verify-network.js scripts/ 2>/dev/null || echo "  verify-network.js already in place"
echo -e "${GREEN}✅ Scripts ready${NC}"

# Step 4: Clean and compile
echo ""
echo -e "${YELLOW}Step 4: Cleaning and compiling contracts...${NC}"
rm -rf artifacts cache
npm install --quiet
npx hardhat compile

# Step 5: Verify network
echo ""
echo -e "${YELLOW}Step 5: Verifying network connection...${NC}"
npx hardhat run scripts/verify-network.js --network sepolia
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Network verification failed!${NC}"
    echo "Please check:"
    echo "  1. You have Sepolia ETH in your wallet"
    echo "  2. Your RPC endpoint is working"
    echo "  3. Your private key is correct"
    exit 1
fi

# Step 6: Confirm deployment
echo ""
echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}Ready to deploy new contracts!${NC}"
echo -e "${YELLOW}========================================${NC}"
echo ""
echo "This will deploy:"
echo "  • NEW OOOWEEEToken contract"
echo "  • NEW OOOWEEESavings contract"
echo "  • NEW OOOWEEEValidators contract"
echo "  • NEW OOOWEEEStability contract"
echo ""
echo -e "${YELLOW}Old contracts backed up to: $BACKUP_NAME${NC}"
echo ""
read -p "Continue with deployment? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Deployment cancelled${NC}"
    exit 1
fi

# Step 7: Deploy
echo ""
echo -e "${YELLOW}Step 6: Deploying contracts...${NC}"
npx hardhat run scripts/deploy-v2.js --network sepolia

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed!${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}✅ CONTRACTS DEPLOYED!${NC}"
echo ""

# Step 8: Ask about liquidity setup
echo -e "${YELLOW}========================================${NC}"
read -p "Do you want to set up Uniswap liquidity now? (requires 0.5 ETH) (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${YELLOW}Setting up Uniswap pool and enabling trading...${NC}"
    npx hardhat run scripts/post-deploy-setup.js --network sepolia
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Liquidity added and trading enabled!${NC}"
    else
        echo -e "${YELLOW}⚠️  Liquidity setup failed - you can run it later with:${NC}"
        echo "  npm run setup"
    fi
else
    echo -e "${YELLOW}Skipping liquidity setup. Run later with:${NC}"
    echo "  npm run setup"
fi

# Step 9: Summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}🎉 REDEPLOYMENT COMPLETE!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "📋 New contract addresses saved to: deployment-sepolia.json"
echo ""
echo "📝 Next steps:"
echo "  1. Update your frontend with new addresses"
echo "  2. Test all contract functions"
echo "  3. If you skipped liquidity: npm run setup"
echo ""
echo -e "${GREEN}Happy testing with OOOWEEE v2! 🚀${NC}"