import axios from 'axios';
import QRCode from 'qrcode';
import Noty from 'noty';

export function initSingleOrder() {
  document.addEventListener('DOMContentLoaded', () => {
    const orderTableBody = document.querySelector('#orderBody');
    const url = window.location.pathname;
    const orderId = url.split('\\').pop().split('/').pop();

    const data = `https://lobster-app-77lrc.ondigitalocean.app${url}`;

    let orders = [];
    let markup;

    axios
      .get('/admin/orders', {
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      })
      .then((res) => {
        orders = res.data;
        markup = generateMarkup(orders);
        orderTableBody.innerHTML = markup;
      })
      .catch((err) => {
        console.log(err);
      });



    function generateMarkup(orders) { 
      let qrCode = '';

      return orders
        .map((order) => {
          if (order && order._id === orderId) {
            QRCode.toDataURL(data, (err, dataURI) => {
              if (err) throw err;
              qrCode = `<img src="${dataURI}"/>`;
            });

            let tableHeaders = `<tr><th class="bg-gray-50 sticky left-0">Sweet Name</th>`;
            order.orderNames.forEach((orderName) => {
              if (!orderName.includes("Name geben")) {
                tableHeaders += `<th>${orderName}</th>`;
              }
            });
            tableHeaders += '</tr>';

            return `
              <div id="order" class="bg-white shadow overflow-hidden sm:rounded-lg">
                <div class="px-4 py-5 sm:px-6">
                <form action="/admin/order/status" method="POST">
                            <input type="hidden" name="orderId" value="${ order._id }">
                            <select name="status" onchange="this.form.submit()"
                                class="block appearance-none w-full bg-white border border-gray-400 hover:border-gray-500 px-4 py-2 pr-8 rounded shadow leading-tight focus:outline-none focus:shadow-outline">
                                <option value="order_placed"
                                    ${ order.status === 'order_placed' ? 'selected' : '' }>
                                    Placed</option>
                                <option value="confirmed" ${ order.status === 'confirmed' ? 'selected' : '' }>
                                    Confirmed</option>
                                <option value="prepared" ${ order.status === 'prepared' ? 'selected' : '' }>
                                    Prepared</option>
                                <option value="delivered" ${ order.status === 'delivered' ? 'selected' : '' }>
                                    Delivered
                                </option>
                                <option value="completed" ${ order.status === 'completed' ? 'selected' : '' }>
                                    Completed
                                </option>
                            </select>
                        </form>
                        <div
                            class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                            <svg class="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20">
                                <path
                                    d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                            </svg>
                        </div>
                  <p class="mt-1 max-w-2xl text-sm text-gray-500">
                    ${order._id}
                  </p>
                </div>
                <div class="border-t border-gray-200">
                  <dl>
                    <div class="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                        ${order.name}
                      </dd>
                    </div>
                    <div class="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                      <dt class="text-sm font-medium text-gray-500">
                        Items
                        </dt>
                        <dd class="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                          <table>
                            <thead>
                              ${tableHeaders} <!-- Add the generated table headers here -->
                            </thead>
                            <tbody>
                            ${renderItems(order.items)}
                          </tbody>
                        </table>
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            `;
          }
        })
        .join('');
    }

    function renderItems(items) {
      let parsedItems = Object.values(items);
      let quantityMatrix = Array(24).fill(0).map(_ => []);
    
      parsedItems.forEach((menuItem) => {
        for (let i = 1; i <= 24; i++) {
          quantityMatrix[i - 1].push(menuItem['quantity' + i]);
        }
      });
    
      let filteredColumns = quantityMatrix.map((quantities, index) => {
        const isZeroColumn = quantities.every(qty => qty === 0);
        return isZeroColumn ? index + 1 : null;
      }).filter((index) => index !== null);
    
      let totalColumnQuantities = Array(24).fill(0);
    
      parsedItems.forEach((menuItem) => {
        for (let i = 1; i <= 24; i++) {
          if (!filteredColumns.includes(i)) {
            totalColumnQuantities[i - 1] += menuItem['quantity' + i];
          }
        }
      });
    
      let lastRow = '<tr><td>Total</td>';
      for (let i = 1; i <= 24; i++) {
        if (!filteredColumns.includes(i)) {
          lastRow += `<td class="total-quantity-cell">${totalColumnQuantities[i - 1]}</td>`;
        }
      }
      lastRow += '</tr>';
    
      let renderedItems = parsedItems
        .map((menuItem) => {
          let quantityInputs = '';
          for (let i = 1; i <= 24; i++) {
            if (!filteredColumns.includes(i)) {
              quantityInputs += `
                <td class="items-center">
                  <input
                    type="number"
                    class="quantity-input"
                    style="text-align: center"
                    value="${menuItem['quantity' + i]}"
                    data-order-id="${orderId}"
                    data-item-id="${menuItem.pizza._id}"
                    data-quantity="quantity${i}"
                  />
                </td>
              `;
            }
          }
          return `
            <tr> 
              <td class="bg-gray-50 sticky left-0">${menuItem.pizza.name}</td>
              ${quantityInputs}
            </tr>
          `;
        })
        .join('');
    
      return renderedItems + lastRow;

    }
    
    
    
    

    function updateItemQuantity(orderId, itemId, newQty, quantityType) {
      axios
        .put(`/admin/orders/${orderId}/items/${itemId}`, { [quantityType]: newQty }) // Use dynamic property name based on quantityType
        .then((res) => {
          new Noty({
            type: 'success',
            text: 'Item quantity updated successfully',
            timeout: 1000, // Adjust the timeout as needed
          }).show();
          
      // Recalculate the total quantity and update the corresponding element
      const totalQtyElements = document.querySelectorAll('.total-quantity-cell');
      const totalQtyIndex = parseInt(quantityType.replace('quantity', '')) - 1;
      let newTotalQty = 0;

      const quantityInputs = document.querySelectorAll('.quantity-input');
      quantityInputs.forEach((input) => {
        if (input.dataset.quantity === quantityType) {
          newTotalQty += parseInt(input.value);
        }
      });

      totalQtyElements[totalQtyIndex].textContent = newTotalQty;
        })
        .catch((err) => {
          console.log('Error updating item quantity:', err);
        });
    }

    orderTableBody.addEventListener('change', function (event) {
      const target = event.target;
      if (target.classList.contains('quantity-input')) {
        console.log(target.dataset.itemId)
        const orderId = target.dataset.orderId;
        const itemId = target.dataset.itemId;
        const newQty = target.value;
        const quantityType = target.dataset.quantity; // Get the quantity type (quantity1, quantity2, etc.)

        console.log(newQty, itemId);

        // Update the appropriate quantity based on quantityType
        updateItemQuantity(orderId, itemId, newQty, quantityType);
      }
    });
  });
}
