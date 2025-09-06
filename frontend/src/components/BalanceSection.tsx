

interface BalanceSectionProps {
  balance: number;
}

const BalanceSection: React.FC<BalanceSectionProps> = ({ balance }) => {
  return (
    <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">포인트 충전</h1>
      <div className="bg-white/20 rounded-lg p-4 backdrop-blur-sm">
        <div className="text-sm opacity-90 mb-1">남은 포인트</div>
        <div className="flex items-baseline">
          <span className="text-3xl font-bold">{balance.toLocaleString()}</span>
          <span className="text-lg ml-2 opacity-90">Point</span>
        </div>
      </div>
    </div>
  );
};

export default BalanceSection;

