

interface ChargeSectionProps {
  chargeAmount: number;
  setChargeAmount: (amount: number) => void;
}

const ChargeSection: React.FC<ChargeSectionProps> = ({ chargeAmount, setChargeAmount }) => {
  const quickChargeAmounts = [1000, 5000, 10000];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value) || 0;
    setChargeAmount(value);
  };

  const handleQuickCharge = (amount: number) => {
    const newAmount = chargeAmount + amount;
    setChargeAmount(newAmount);
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="chargeAmount" className="block text-sm font-medium text-gray-700 mb-2">
          충전할 포인트
        </label>
        <div className="relative">
          <input
            type="number"
            id="chargeAmount"
            value={chargeAmount || ''}
            onChange={handleInputChange}
            placeholder="충전할 포인트를 입력하세요"
            min="0"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
          />
          <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500">
            Point
          </span>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">빠른 충전</h3>
        <div className="grid grid-cols-3 gap-2">
          {quickChargeAmounts.map((amount) => (
            <button
              key={amount}
              onClick={() => handleQuickCharge(amount)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
            >
              {amount.toLocaleString()} Point
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChargeSection;

